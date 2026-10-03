<?php
declare(strict_types=1);

/** Fetch only public HTTP(S) addresses, pin DNS, and revalidate each redirect. */
function fetchPublicMedia(string $url, int $limit = 2097152, bool $headOnly = false): array {
    if (!function_exists('curl_init')) throw new RuntimeException('Remote media requires the PHP cURL extension.');
    for ($redirect = 0; $redirect < 6; $redirect++) {
        $parts = parse_url($url);
        if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http','https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) && !in_array($parts['port'], [80,443], true)) throw new RuntimeException('Use a public HTTP or HTTPS media URL.');
        $host = strtolower($parts['host']);
        $records = filter_var($host, FILTER_VALIDATE_IP) ? [['ip'=>$host]] : dns_get_record($host, DNS_A | DNS_AAAA);
        $ips = [];
        foreach ($records ?: [] as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (!$ip) continue;
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) || str_contains($ip, ':') && !preg_match('/^[23][0-9a-f]{3}:/i', $ip) || preg_match('/^(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(?:18|19)\.|192\.0\.0\.|22[4-9]\.|23\d\.)/', $ip)) throw new RuntimeException('Private network URLs are not supported.');
            $ips[] = $ip;
        }
        if (!$ips) throw new RuntimeException('Unable to resolve the media host.');
        $port = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
        $curl = curl_init($url); $body = ''; $headers = []; $tooLarge = false;
        curl_setopt_array($curl, [CURLOPT_PROXY=>'', CURLOPT_FOLLOWLOCATION=>false, CURLOPT_NOBODY=>$headOnly, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>45,
            CURLOPT_PROTOCOLS=>CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT=>'HUB Media/1.0',
            CURLOPT_RESOLVE=>[$host.':'.$port.':'.(str_contains($ips[0], ':') ? '['.$ips[0].']' : $ips[0])],
            CURLOPT_HEADERFUNCTION=>static function($ch, $line) use (&$headers) { $pair = explode(':', $line, 2); if (count($pair) === 2) $headers[strtolower(trim($pair[0]))] = trim($pair[1]); return strlen($line); },
            CURLOPT_WRITEFUNCTION=>static function($ch, $chunk) use (&$body, &$tooLarge, $limit) { if (strlen($body)+strlen($chunk)>$limit) { $tooLarge=true; return 0; } $body.=$chunk; return strlen($chunk); }
        ]);
        $ok = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); $error = curl_error($curl); curl_close($curl);
        if ($tooLarge) throw new RuntimeException('Remote media exceeds the '.round($limit/1048576).' MB download limit.');
        if ($ok === false) throw new RuntimeException('Could not fetch remote media: '.$error);
        if ($status >= 300 && $status < 400 && !empty($headers['location'])) {
            $next = $headers['location'];
            if (str_starts_with($next, '//')) $next = $parts['scheme'].':'.$next;
            elseif (!preg_match('~^https?://~i', $next)) $next = $parts['scheme'].'://'.$host.(str_starts_with($next, '/') ? $next : rtrim(dirname($parts['path'] ?? '/'), '/').'/'.$next);
            $url = $next; continue;
        }
        if ($status < 200 || $status >= 300) throw new RuntimeException('The media host returned HTTP '.$status.'.');
        return ['body'=>$body, 'headers'=>$headers, 'url'=>$url];
    }
    throw new RuntimeException('Too many media redirects.');
}

function socialMediaInfo(string $url): ?array {
    $parts = parse_url($url); if (!$parts || !in_array($parts['scheme'] ?? '', ['http','https'], true)) return null;
    $host = strtolower($parts['host'] ?? ''); $path = $parts['path'] ?? ''; parse_str($parts['query'] ?? '', $query);
    $id = null;
    if (in_array($host, ['youtu.be','www.youtu.be'], true)) $id = trim($path, '/');
    elseif (in_array($host, ['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'], true)) {
        $id = $query['v'] ?? null;
        if (preg_match('~^/(?:embed|shorts|live)/([\w-]+)~', $path, $match)) $id = $match[1];
    }
    if ($id && preg_match('/^[\w-]{11}$/', $id)) return ['provider'=>'youtube','url'=>'https://www.youtube.com/watch?v='.$id,'embedUrl'=>'https://www.youtube.com/embed/'.$id,'thumbnail'=>'https://i.ytimg.com/vi/'.$id.'/hqdefault.jpg'];
    if (in_array($host, ['tiktok.com','www.tiktok.com','m.tiktok.com'], true) && preg_match('~/(?:video|player/v1|embed/v2)/(\d+)~', $path, $match)) return ['provider'=>'tiktok','url'=>$url,'embedUrl'=>'https://www.tiktok.com/player/v1/'.$match[1], 'thumbnail'=>''];
    if (in_array($host, ['instagram.com','www.instagram.com'], true) && preg_match('~^/(p|reel|reels|tv)/([\w-]+)~', $path, $match)) {
        $canonical = 'https://www.instagram.com/'.($match[1] === 'reels' ? 'reel' : $match[1]).'/'.$match[2].'/';
        return ['provider'=>'instagram','url'=>$canonical,'embedUrl'=>$canonical.'embed/', 'thumbnail'=>''];
    }
    return null;
}

function resolveSocialMedia(string $url): array {
    if (preg_match('~^https?://(?:vm|vt)\.tiktok\.com/~i', $url)) $url = fetchPublicMedia($url)['url'];
    $info = socialMediaInfo($url);
    if (!$info) throw new RuntimeException('Use a YouTube, TikTok, or Instagram post URL.');
    try {
        if ($info['provider'] === 'tiktok') {
            $data = json_decode(fetchPublicMedia('https://www.tiktok.com/oembed?url='.rawurlencode($url))['body'], true) ?: [];
            $info['thumbnail'] = $data['thumbnail_url'] ?? '';
        } elseif ($info['provider'] === 'instagram') {
            $token = getenv('HUB_INSTAGRAM_OEMBED_TOKEN');
            if ($token) {
                $data = json_decode(fetchPublicMedia('https://graph.facebook.com/instagram_oembed?url='.rawurlencode($info['url']).'&access_token='.rawurlencode($token))['body'], true) ?: [];
                $info['thumbnail'] = $data['thumbnail_url'] ?? '';
            }
            if (!$info['thumbnail']) {
                $html = fetchPublicMedia($info['url'])['body'];
                if (class_exists('DOMDocument')) {
                    $dom = new DOMDocument(); @$dom->loadHTML($html);
                    foreach ($dom->getElementsByTagName('meta') as $meta) if ($meta->getAttribute('property') === 'og:image') { $info['thumbnail'] = html_entity_decode($meta->getAttribute('content'), ENT_QUOTES); break; }
                }
            }
        }
    } catch (Throwable $error) { $info['warning'] = 'The provider did not supply a poster. The embed is still available.'; }
    if (!$info['thumbnail']) $info['warning'] = 'The provider did not supply a poster. Add a thumbnail manually or configure Instagram oEmbed access.';
    return $info;
}
