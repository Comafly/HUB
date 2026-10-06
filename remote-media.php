<?php
declare(strict_types=1);

/** Stream fallback: connect to the validated IP, but verify TLS against the host. */
function fetchPinnedMediaStream(array $parts, string $ip, int $limit, bool $headOnly, int $timeout): array {
    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        throw new RuntimeException('Remote media needs PHP cURL or allow_url_fopen enabled. Ask your hosting administrator to enable cURL for this site.');
    }
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, stream_get_wrappers(), true)) {
        throw new RuntimeException('Remote HTTPS media needs PHP cURL or the OpenSSL HTTPS stream wrapper. Ask your hosting administrator to enable cURL for this site.');
    }
    $host = $parts['host'];
    $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
    $address = str_contains($ip, ':') ? '['.$ip.']' : $ip;
    $target = $scheme.'://'.$address.':'.$port.($parts['path'] ?? '/').(isset($parts['query']) ? '?'.$parts['query'] : '');
    $context = stream_context_create([
        'http' => [
            'method' => $headOnly ? 'HEAD' : 'GET',
            'header' => ['Host: '.$host.(isset($parts['port']) ? ':'.$port : ''), 'Connection: close', 'Accept-Encoding: identity'],
            'user_agent' => 'HUB Media/1.0',
            'protocol_version' => 1.1,
            'follow_location' => 0,
            'max_redirects' => 0,
            'ignore_errors' => true,
            'timeout' => $timeout,
        ],
        'ssl' => ['peer_name' => trim($host, '[]'), 'verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false, 'SNI_enabled' => true],
    ]);
    $deadline = microtime(true) + $timeout;
    $stream = @fopen($target, 'rb', false, $context);
    if ($stream === false) throw new RuntimeException('Could not fetch remote media. Check outbound HTTP/HTTPS access and PHP CA certificates, or enable PHP cURL.');
    try {
        $headers = []; $status = 0; $body = '';
        foreach (stream_get_meta_data($stream)['wrapper_data'] ?? [] as $line) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})\b~i', $line, $match)) {
                $status = (int)$match[1]; $headers = [];
            } else {
                $pair = explode(':', $line, 2);
                if (count($pair) === 2) $headers[strtolower(trim($pair[0]))] = trim($pair[1]);
            }
        }
        // Only successful GET bodies are needed; redirects are checked by the caller.
        if (!$headOnly && $status >= 200 && $status < 300) {
            if (isset($headers['content-length']) && (float)$headers['content-length'] > $limit) {
                throw new RuntimeException('Remote media exceeds the '.round($limit/1048576).' MB download limit.');
            }
            while (!feof($stream)) {
                $remaining = $deadline - microtime(true);
                if ($remaining <= 0) throw new RuntimeException('Remote media request timed out.');
                $seconds = (int)$remaining;
                stream_set_timeout($stream, $seconds, (int)(($remaining - $seconds) * 1000000));
                $chunk = @fread($stream, min(8192, $limit - strlen($body) + 1));
                if (stream_get_meta_data($stream)['timed_out']) throw new RuntimeException('Remote media request timed out.');
                if ($chunk === false || ($chunk === '' && !feof($stream))) throw new RuntimeException('Could not read remote media.');
                $body .= $chunk;
                if (strlen($body) > $limit) throw new RuntimeException('Remote media exceeds the '.round($limit/1048576).' MB download limit.');
            }
            if (isset($headers['content-length']) && !isset($headers['transfer-encoding']) && strlen($body) !== (int)$headers['content-length']) {
                throw new RuntimeException('The media download ended before the full file was received.');
            }
        }
        return ['body'=>$body, 'headers'=>$headers, 'status'=>$status];
    } finally {
        fclose($stream);
    }
}

/** Fetch only public HTTP(S) addresses, pin DNS, and revalidate each redirect. */
function fetchPublicMedia(string $url, int $limit = 2097152, bool $headOnly = false, int $timeout = 45): array {
    for ($redirect = 0; $redirect < 6; $redirect++) {
        if (preg_match('/[\x00-\x20\x7f]/', $url) || str_contains($url, '\\')) throw new RuntimeException('Use a public HTTP or HTTPS media URL.');
        $parts = parse_url($url);
        if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http','https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) && !in_array($parts['port'], [80,443], true)) throw new RuntimeException('Use a public HTTP or HTTPS media URL.');
        $parts['scheme'] = strtolower($parts['scheme']);
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
        if (function_exists('curl_init')) {
            $curl = curl_init($url); $body = ''; $headers = []; $tooLarge = false;
            curl_setopt_array($curl, [CURLOPT_PROXY=>'', CURLOPT_FOLLOWLOCATION=>false, CURLOPT_NOBODY=>$headOnly, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>$timeout,
                CURLOPT_PROTOCOLS=>CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT=>'HUB Media/1.0',
                CURLOPT_RESOLVE=>[$host.':'.$port.':'.(str_contains($ips[0], ':') ? '['.$ips[0].']' : $ips[0])],
                CURLOPT_HEADERFUNCTION=>static function($ch, $line) use (&$headers) { $pair = explode(':', $line, 2); if (count($pair) === 2) $headers[strtolower(trim($pair[0]))] = trim($pair[1]); return strlen($line); },
                CURLOPT_WRITEFUNCTION=>static function($ch, $chunk) use (&$body, &$tooLarge, $limit) { if (strlen($body)+strlen($chunk)>$limit) { $tooLarge=true; return 0; } $body.=$chunk; return strlen($chunk); }
            ]);
            $ok = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); $error = curl_error($curl); curl_close($curl);
            if ($tooLarge) throw new RuntimeException('Remote media exceeds the '.round($limit/1048576).' MB download limit.');
            if ($ok === false) throw new RuntimeException('Could not fetch remote media: '.$error);
        } else {
            $remote = fetchPinnedMediaStream($parts, $ips[0], $limit, $headOnly, $timeout);
            $body = $remote['body']; $headers = $remote['headers']; $status = $remote['status'];
        }
        if ($status >= 300 && $status < 400 && !empty($headers['location'])) {
            $next = $headers['location'];
            if (str_starts_with($next, '//')) $next = $parts['scheme'].':'.$next;
            elseif (!preg_match('~^https?://~i', $next)) $next = $parts['scheme'].'://'.$host.(isset($parts['port']) ? ':'.$parts['port'] : '').(str_starts_with($next, '/') ? $next : rtrim(dirname($parts['path'] ?? '/'), '/').'/'.$next);
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
