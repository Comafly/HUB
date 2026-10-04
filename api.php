<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const DATA_FILE = __DIR__ . '/data/app.json';
const UPLOAD_DIR = __DIR__ . '/uploads';
const UPLOAD_URL = 'uploads';
const FONT_DIR = __DIR__ . '/assets/fonts';
const FONT_URL = 'assets/fonts';
const CALENDAR_DIR = __DIR__ . '/data';
require_once __DIR__ . '/metadata.php';
require_once __DIR__ . '/tab-config.php';
require_once __DIR__ . '/tmdb.php';
// Remote media helpers are bundled so a missing optional file cannot break the API.
/** Fetch only public HTTP(S) addresses, pin DNS, and revalidate each redirect. */
function fetchPublicMedia(string $url, int $limit = 2097152, bool $headOnly = false, int $timeout = 45): array {
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
        curl_setopt_array($curl, [CURLOPT_PROXY=>'', CURLOPT_FOLLOWLOCATION=>false, CURLOPT_NOBODY=>$headOnly, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>$timeout,
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
    if (in_array($host, ['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com','fb.watch'], true)) {
        if (preg_match('~^/plugins/(video|post)\.php$~', $path) && !empty($query['href'])) return socialMediaInfo((string)$query['href']);
        $video = $host === 'fb.watch' || preg_match('~/(?:videos|reel|reels|watch)(?:/|$)|^/(?:video|watch)\.php$|^/share/[vr]/~', $path) || isset($query['v']);
        $post = preg_match('~/(?:posts|permalink)(?:/|$)|^/(?:permalink|story|photo)\.php$|^/share/p/~', $path);
        if ($video || $post) {
            $canonical = $host === 'fb.watch' ? $url : 'https://www.facebook.com'.$path.(empty($parts['query']) ? '' : '?'.$parts['query']);
            return ['provider'=>'facebook','url'=>$canonical,'embedUrl'=>'https://www.facebook.com/plugins/'.($video ? 'video' : 'post').'.php?href='.rawurlencode($canonical).'&show_text=false','thumbnail'=>'','facebookVideo'=>(bool)$video];
        }
    }
    return null;
}

function publicHttpUrl(string $value): string {
    $value = trim($value);
    $parts = parse_url($value);
    return $parts && in_array(strtolower($parts['scheme'] ?? ''), ['http','https'], true) && !isset($parts['user']) && !isset($parts['pass']) && filter_var($value, FILTER_VALIDATE_URL) ? $value : '';
}

function absolutePageUrl(string $base, string $value): string {
    $value = html_entity_decode(trim($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($value === '') return '';
    if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $value)) return publicHttpUrl($value);
    $parts = parse_url($base);
    if (!$parts || empty($parts['host'])) return '';
    if (str_starts_with($value, '//')) return publicHttpUrl($parts['scheme'].':'.$value);
    $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    $path = str_starts_with($value, '/') ? $value : rtrim(dirname($parts['path'] ?? '/'), '/').'/'.$value;
    // Resolve relative path segments without changing query-string bytes.
    $pair = explode('?', $path, 2); $segments = [];
    foreach (explode('/', $pair[0]) as $segment) {
        if ($segment === '..') array_pop($segments);
        elseif ($segment !== '' && $segment !== '.') $segments[] = $segment;
    }
    return publicHttpUrl($origin.'/'.implode('/', $segments).(isset($pair[1]) ? '?'.$pair[1] : ''));
}

function cleanPageTitle(string $title): string {
    $title = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($title), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    return function_exists('mb_substr') ? mb_substr($title, 0, 500) : substr($title, 0, 500);
}

function parsePageMetadata(string $html, string $url): array {
    $title = ''; $poster = ''; $icon = ''; $ogTitle = '';
    // Read attributes without executing any page scripts or remote XML entities.
    preg_match_all('~<(meta|link)\b[^>]*>~i', $html, $elements, PREG_SET_ORDER);
    foreach ($elements as $element) {
        preg_match_all('~([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))~', $element[0], $matches, PREG_SET_ORDER);
        $attributes = [];
        foreach ($matches as $match) $attributes[strtolower($match[1])] = html_entity_decode(($match[2] ?? '') !== '' ? $match[2] : (($match[3] ?? '') !== '' ? $match[3] : ($match[4] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (strtolower($element[1]) === 'meta') {
            $key = strtolower($attributes['property'] ?? $attributes['name'] ?? '');
            if ($key === 'og:title') $ogTitle = $attributes['content'] ?? '';
            if (in_array($key, ['og:image','twitter:image'], true) && !$poster) $poster = absolutePageUrl($url, $attributes['content'] ?? '');
        } elseif (!$icon && preg_match('/(?:^|\s)icon(?:\s|$)/i', $attributes['rel'] ?? '')) $icon = absolutePageUrl($url, $attributes['href'] ?? '');
    }
    if (preg_match('~<title\b[^>]*>(.*?)</title>~is', $html, $match)) $title = $match[1];
    return ['title'=>cleanPageTitle($ogTitle ?: $title), 'thumbnail'=>$poster, 'faviconUrl'=>$icon ?: absolutePageUrl($url, '/favicon.ico')];
}

function urlBackgrounds(): array {
    $files = array_filter(glob(__DIR__.'/assets/url-bgs/*') ?: [], static fn($path) => (bool)preg_match('/\.jpe?g$/i', $path));
    natsort($files);
    return array_values(array_map(static fn($path) => 'assets/url-bgs/'.basename($path), array_filter($files, 'is_file')));
}

function resolveSocialMedia(string $url): array {
    if (preg_match('~^https?://(?:vm|vt)\.tiktok\.com/~i', $url)) $url = fetchPublicMedia($url)['url'];
    $info = socialMediaInfo($url);
    if (!$info) throw new RuntimeException('This URL does not provide a supported media embed.');
    $data = []; $page = null;
    if ($info['provider'] === 'youtube') {
        $data = json_decode(fetchPublicMedia('https://www.youtube.com/oembed?format=json&url='.rawurlencode($info['url']), 2097152, false, 12)['body'], true) ?: [];
    } elseif ($info['provider'] === 'tiktok') {
        $data = json_decode(fetchPublicMedia('https://www.tiktok.com/oembed?url='.rawurlencode($url), 2097152, false, 12)['body'], true) ?: [];
    } elseif ($info['provider'] === 'facebook') {
        $endpoint = !empty($info['facebookVideo']) ? 'oembed_video' : 'oembed_post';
        $data = json_decode(fetchPublicMedia('https://graph.facebook.com/v25.0/'.$endpoint.'?url='.rawurlencode($info['url']), 2097152, false, 12)['body'], true) ?: [];
    } else {
        $token = getenv('HUB_INSTAGRAM_OEMBED_TOKEN');
        $endpoint = 'https://graph.facebook.com/v25.0/instagram_oembed?url='.rawurlencode($info['url']);
        if ($token) $endpoint .= '&access_token='.rawurlencode($token);
        try { $data = json_decode(fetchPublicMedia($endpoint, 2097152, false, 12)['body'], true) ?: []; }
        catch (Throwable $error) { /* Try the public embed page independently. */ }
        if (empty($data['html']) || !empty($data['error'])) {
            $page = fetchPublicMedia($info['embedUrl'], 2097152, false, 12);
            $meta = parsePageMetadata($page['body'], $page['url']);
            $framePolicy = strtolower($page['headers']['x-frame-options'] ?? '');
            if (str_contains($page['url'], '/accounts/') || in_array($framePolicy, ['deny','sameorigin'], true) || preg_match("~frame-ancestors\\s+'none'~i", $page['headers']['content-security-policy'] ?? '')) throw new RuntimeException('The owner or provider does not allow embedding.');
            $data = ['html'=>preg_match('~(?:EmbeddedMedia|Embed\\b|instagram-media)~i', $page['body']) ? 'public-embed' : '', 'thumbnail_url'=>$meta['thumbnail'], 'title'=>$meta['title']];
        }
    }
    if (empty($data['html']) || !empty($data['error']) || !empty($data['error_code'])) throw new RuntimeException('The owner or provider does not allow embedding.');
    $info['thumbnail'] = publicHttpUrl((string)($data['thumbnail_url'] ?? $info['thumbnail'] ?? ''));
    $info['title'] = cleanPageTitle((string)($data['title'] ?? ''));
    $info['faviconUrl'] = absolutePageUrl($info['url'], '/favicon.ico');
    $info['embedWidth'] = max(0, (int)($data['width'] ?? 0));
    $info['embedHeight'] = max(0, (int)($data['height'] ?? 0));
    return $info;
}

function inspectLinkMetadata(string $url): array {
    $url = publicHttpUrl($url);
    if (!$url) throw new RuntimeException('Enter a valid HTTP or HTTPS URL.');
    $social = socialMediaInfo($url);
    $result = ['title'=>'', 'faviconUrl'=>absolutePageUrl($url, '/favicon.ico'), 'thumbnail'=>$social['thumbnail'] ?? '', 'embedAllowed'=>false, 'embedUrl'=>'', 'provider'=>$social['provider'] ?? ''];
    // A failed embed check must never stop independent page/poster discovery.
    if ($social || preg_match('~^https?://(?:vm|vt)\.tiktok\.com/~i', $url)) {
        try {
            $embed = resolveSocialMedia($url);
            $result = array_merge($result, $embed, ['embedAllowed'=>true]);
        } catch (Throwable $error) { /* Embedding is optional. */ }
    }
    if (!$result['thumbnail'] || !$result['title']) {
        try {
            $page = fetchPublicMedia($url, 2097152, false, 12);
            $meta = parsePageMetadata($page['body'], $page['url']);
            foreach (['title','thumbnail','faviconUrl'] as $key) if (!empty($meta[$key]) && (empty($result[$key]) || $key === 'faviconUrl')) $result[$key] = $meta[$key];
        } catch (Throwable $error) { /* Keep any independent poster or embed result. */ }
    }
    return $result;
}

function response(mixed $data = null, int $status = 200): never {
    http_response_code($status);
    echo json_encode(['ok' => $status < 400, 'data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function ensureStorage(): void {
    if (!is_dir(dirname(DATA_FILE))) mkdir(dirname(DATA_FILE), 0775, true);
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0775, true);
    if (!is_dir(FONT_DIR)) mkdir(FONT_DIR, 0775, true);
    if (!is_dir(CALENDAR_DIR)) mkdir(CALENDAR_DIR, 0775, true);
    if (!file_exists(DATA_FILE)) file_put_contents(DATA_FILE, json_encode(defaultData(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}
function defaultData(): array {
    return [
        'tiles' => [
            ['id'=>'seed-1','section'=>'dashboard','type'=>'link','label'=>'COMMA Team Showcase','description'=>'Selected work, references, and current directions.','tags'=>['Design'],'size'=>'large','orientation'=>'landscape','url'=>'https://example.com','thumbnail'=>'','createdAt'=>date(DATE_ATOM)],
            ['id'=>'seed-2','section'=>'dashboard','type'=>'text','label'=>'Today / 01','description'=>'Keep the board loose. Save references first and sort them later.','tags'=>['Typography'],'size'=>'small','orientation'=>'portrait', 'text'=>"COLLECT\nFIRST.\nCURATE\nSECOND.",'textStyle'=>['font'=>'Arial, sans-serif','fontSize'=>31,'bold'=>true,'italic'=>false,'underline'=>false,'align'=>'left'],'createdAt'=>date(DATE_ATOM)],
            ['id'=>'seed-3','section'=>'dashboard','type'=>'link','label'=>'Motion reference','description'=>'Timing and transition notes for interface motion.','tags'=>['Animation'],'size'=>'medium','orientation'=>'portrait','url'=>'https://www.awwwards.com','thumbnail'=>'','createdAt'=>date(DATE_ATOM)],
            ['id'=>'seed-4','section'=>'projects','type'=>'text','label'=>'Project board','description'=>'Working notes for active builds.','tags'=>['Design'],'size'=>'medium','orientation'=>'landscape','text'=>'COMMA / PROJECTS','textStyle'=>['font'=>'Arial, sans-serif','fontSize'=>36,'bold'=>true,'italic'=>false,'underline'=>false,'align'=>'left'],'createdAt'=>date(DATE_ATOM)],
            ['id'=>'seed-5','section'=>'resources','type'=>'text','label'=>'Type specimen notes','description'=>'Useful typography references and foundry links.','tags'=>['Typography'],'size'=>'medium','orientation'=>'portrait', 'text'=>"Aa\nTYPE\nINDEX",'textStyle'=>['font'=>'Georgia, serif','fontSize'=>42,'bold'=>true,'italic'=>false,'underline'=>false,'align'=>'left'],'createdAt'=>date(DATE_ATOM)],
        ],
        'topLinks' => [],
        'bookmarks' => ['seed-1','seed-3'],
        'collections' => [['id'=>'collection-default','name'=>'Saved','collapsed'=>false,'items'=>['seed-1','seed-3']]],
        'settings' => ['theme'=>'umber','mode'=>'dark'],
        'fonts' => [],
    ];
}
function readData(): array {
    ensureStorage();
    $fp = fopen(DATA_FILE, 'c+');
    if (!$fp) fail('Unable to open data file', 500);
    flock($fp, LOCK_SH);
    $json = stream_get_contents($fp) ?: '{}';
    flock($fp, LOCK_UN);
    fclose($fp);
    return array_replace(defaultData(), json_decode($json, true) ?: []);
}
function mutateData(callable $callback): mixed {
    ensureStorage();
    $fp = fopen(DATA_FILE, 'c+');
    if (!$fp) fail('Unable to open data file', 500);
    flock($fp, LOCK_EX);
    $json = stream_get_contents($fp) ?: '{}';
    $data = array_replace(defaultData(), json_decode($json, true) ?: []);
    $result = $callback($data);
    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fp); flock($fp, LOCK_UN); fclose($fp);
    return $result;
}
function bodyJson(): array {
    $raw = file_get_contents('php://input') ?: '{}';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function tileInput(): array {
    $json = str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json');
    $raw = $json ? file_get_contents('php://input') : ($_POST['metadata'] ?? null);
    if ($raw === null) return $_POST; // Older clients remain supported.
    $input = json_decode((string)$raw, true);
    if (!is_array($input) || array_is_list($input)) fail('Invalid tile metadata');
    foreach ($input as $value) if (!is_string($value)) fail('Tile metadata fields must be strings');
    return $input;
}
function id(string $prefix): string { return $prefix . '-' . bin2hex(random_bytes(6)); }
function normalizeUrl(string $value): string { $value = trim($value); if ($value === '') return ''; if (!preg_match('~^[a-z][a-z0-9+.-]*://~i', $value)) $value = 'https://' . $value; return filter_var($value, FILTER_VALIDATE_URL) ? $value : ''; }
function cleanTags(string $value): array {
    $parts = array_filter(array_map('trim', explode(',', $value)));
    return array_values(array_unique(array_slice($parts, 0, 12)));
}
function uploadFolder(string $contentId): string {
    $folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $contentId);
    if ($folder === '') fail('Invalid content id', 500);
    $directory = UPLOAD_DIR . '/' . $folder;
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) fail('Unable to create the upload folder', 500);
    return $folder;
}
function storeUpload(array $file, string $contentId): ?string {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) return null;
    if ($error !== UPLOAD_ERR_OK) fail('Upload failed. Check the file size and the server upload limit.');
    $name = basename((string)$file['name']);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $safeExt = preg_replace('/[^a-z0-9]/', '', $ext);
    $filename = bin2hex(random_bytes(10)) . ($safeExt ? '.' . $safeExt : '');
    $folder = uploadFolder($contentId);
    $destination = UPLOAD_DIR . '/' . $folder . '/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destination)) fail('Upload failed', 500);
    return UPLOAD_URL . '/' . $folder . '/' . $filename;
}
/** Delete saved upload files (and their folder once empty). Only paths inside uploads/ are ever touched. */
function deleteUploads(array $paths): void {
    $root = realpath(UPLOAD_DIR);
    if (!$root) return;
    foreach (array_unique(array_filter($paths, fn($path) => is_string($path) && $path !== '')) as $path) {
        if (!str_starts_with($path, UPLOAD_URL . '/')) continue;
        $real = realpath(__DIR__ . '/' . $path);
        if (!$real || !is_file($real) || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) continue;
        @unlink($real);
        $parent = dirname($real);
        if ($parent !== $root) @rmdir($parent); // Only succeeds when the folder is empty.
    }
}

function calendarFilePath(): ?string {
    $files = glob(CALENDAR_DIR . '/*.ics') ?: [];
    sort($files, SORT_NATURAL | SORT_FLAG_CASE);
    foreach ($files as $file) if (is_file($file)) return $file;
    return null;
}
function calendarPayload(): array {
    $path = calendarFilePath();
    if (!$path) return ['exists'=>false,'fileName'=>'','updatedAt'=>null,'content'=>''];
    return [
        'exists'=>true,
        'fileName'=>basename($path),
        'updatedAt'=>date(DATE_ATOM, filemtime($path) ?: time()),
        'content'=>(string)file_get_contents($path),
    ];
}
function validateCalendarContent(string $content): void {
    if (stripos($content, 'BEGIN:VCALENDAR') === false || stripos($content, 'END:VCALENDAR') === false) fail('That file does not appear to be a valid ICS calendar.');
}

function normalizedFiles(string $field): array {
    if (!isset($_FILES[$field])) return [];
    $input = $_FILES[$field];
    if (!is_array($input['name'])) return [$input];
    $files = [];
    foreach ($input['name'] as $i => $name) {
        $files[] = ['name'=>$name,'type'=>$input['type'][$i] ?? '','tmp_name'=>$input['tmp_name'][$i] ?? '','error'=>$input['error'][$i] ?? UPLOAD_ERR_NO_FILE,'size'=>$input['size'][$i] ?? 0];
    }
    return $files;
}
function storeMany(string $contentId, string ...$fields): array {
    $paths = [];
    foreach ($fields as $field) foreach (normalizedFiles($field) as $file) { $stored = storeUpload($file, $contentId); if ($stored) $paths[] = $stored; }
    return $paths;
}

/** Validate an uploaded font by extension and file signature. */
function fontFormat(string $ext, string $path): ?string {
    $head = (string)@file_get_contents($path, false, null, 0, 64);
    $magic = substr($head, 0, 4);
    return match ($ext) {
        'ttf' => in_array($magic, ["\x00\x01\x00\x00", 'true', 'OTTO'], true) ? 'truetype' : null,
        'otf' => in_array($magic, ['OTTO', "\x00\x01\x00\x00", 'true'], true) ? 'opentype' : null,
        'woff' => $magic === 'wOFF' ? 'woff' : null,
        'woff2' => $magic === 'wOF2' ? 'woff2' : null,
        'ttc' => $magic === 'ttcf' ? 'truetype' : null,
        'otc' => $magic === 'ttcf' ? 'opentype' : null,
        'eot' => substr($head, 34, 2) === 'LP' ? 'embedded-opentype' : null,
        default => null,
    };
}
function storeFont(array $file, string $requestedName, array $existingFonts): array {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) fail('Choose a font file');
    if ($error !== UPLOAD_ERR_OK) fail('Upload failed. Check the file size and the server upload limit.');
    $original = basename((string)$file['name']);
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, ['ttf','otf','woff','woff2','ttc','otc','eot'], true)) fail('Unsupported font type. Use TTF, OTF, WOFF, WOFF2, TTC, OTC or EOT.');
    $format = fontFormat($ext, (string)$file['tmp_name']);
    if (!$format) fail('That file does not look like a valid ' . strtoupper($ext) . ' font.');
    $name = trim(preg_replace('/\s+/', ' ', preg_replace('/[^\p{L}\p{N} _.-]/u', '', $requestedName !== '' ? $requestedName : pathinfo($original, PATHINFO_FILENAME))));
    if ($name === '') $name = 'Custom font';
    $name = function_exists('mb_substr') ? mb_substr($name, 0, 60) : substr($name, 0, 60);
    foreach ($existingFonts as $font) if (strcasecmp($font['name'] ?? '', $name) === 0) fail('A font named "' . $name . '" already exists. Rename the file and try again.');
    $builtIn = ['arial','helvetica','georgia','times new roman','verdana','tahoma','trebuchet ms','courier new','impact','system ui'];
    if (in_array(strtolower($name), $builtIn, true)) $name .= ' Custom';
    $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: 'font';
    $filename = $slug . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
    if (!is_dir(FONT_DIR) && !mkdir(FONT_DIR, 0775, true) && !is_dir(FONT_DIR)) fail('Unable to create the fonts folder', 500);
    if (!move_uploaded_file($file['tmp_name'], FONT_DIR . '/' . $filename)) fail('Upload failed', 500);
    return [
        'id' => id('font'), 'name' => $name, 'family' => "'" . $name . "', sans-serif",
        'file' => FONT_URL . '/' . $filename, 'ext' => $ext, 'format' => $format,
        'originalName' => substr($original, 0, 120), 'createdAt' => date(DATE_ATOM),
    ];
}

$action = $_GET['action'] ?? 'bootstrap';

try {
    ensureStorage();
    if (!in_array($action, ['bootstrap', 'content.download', 'tiles.download'], true) && $_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
    switch ($action) {
        case 'bootstrap':
            $data = readData();
            $needsMigration = false;
            foreach ($data['tiles'] as $tile) if (!array_key_exists('dateAdded', $tile) || !array_key_exists('fileMetadata', $tile)) { $needsMigration = true; break; }
            if ($needsMigration) $data = mutateData(function (&$data) {
                foreach ($data['tiles'] as &$tile) {
                    // Preserve historical creation dates; do not invent dates for legacy items.
                    if (!array_key_exists('dateAdded', $tile)) $tile['dateAdded'] = $tile['createdAt'] ?? null;
                    if (!array_key_exists('fileMetadata', $tile)) {
                        $tile['fileMetadata'] = []; $tags = [];
                        foreach ($tile['files'] ?? [] as $path) {
                            $real = realpath(__DIR__ . '/' . $path); $root = realpath(UPLOAD_DIR);
                            if (!$real || !$root || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) continue;
                            $meta = mediaMetadata($real); $tile['fileMetadata'][$path] = $meta;
                            $tags = array_merge($tags, $meta['tags'] ?? []);
                        }
                        $tile['metadataTags'] = array_values(array_unique($tags));
                    }
                }
                unset($tile);
                return $data;
            });
            $data['calendar'] = calendarPayload();
            $data['urlBackgrounds'] = urlBackgrounds();
            $data['tabs'] = tabDefinitions();
            response($data);

        case 'metadata.inspect':
            $file = normalizedFiles('file')[0] ?? null;
            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('Metadata preview upload failed');
            response(mediaMetadata((string)$file['tmp_name']));

        case 'tiles.download':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail('GET required', 405);
            $tile = null;
            foreach (readData()['tiles'] as $candidate) {
                if ($candidate['id'] === ($_GET['id'] ?? '')) { $tile = $candidate; break; }
            }
            if (!$tile || empty($tile['files'])) fail('No files found', 404);
            $entries = []; $names = [];
            foreach ($tile['files'] as $file) {
                $path = realpath(__DIR__ . '/' . $file);
                $allowed = false;
                foreach ([UPLOAD_DIR, FONT_DIR] as $directory) {
                    $root = realpath($directory);
                    if ($path && $root && str_starts_with($path, $root . DIRECTORY_SEPARATOR)) $allowed = true;
                }
                if (!$allowed || !is_file($path) || !is_readable($path)) fail('File unavailable', 404);
                $name = basename($path);
                $base = $name; $suffix = 2;
                while (isset($names[$name])) $name = ($suffix++) . '-' . $base;
                $names[$name] = true;
                $entries[] = ['name'=>$name, 'path'=>$path];
            }
            $selectedIndex = array_key_exists('index', $_GET) ? filter_var($_GET['index'], FILTER_VALIDATE_INT) : null;
            if ($selectedIndex !== null) {
                if ($selectedIndex === false || $selectedIndex < 0 || $selectedIndex >= count($entries)) fail('File unavailable', 404);
                $entries = [$entries[$selectedIndex]];
            }
            if (count($entries) > 1 || preg_match('/\.(?:[cm]?js|jsx)$/i', $entries[0]['name'])) {
                require_once __DIR__ . '/backup.php';
                $name = trim(preg_replace('/[^a-zA-Z0-9_-]+/', '-', $tile['label'] ?? ''), '-');
                downloadZipEntries($entries, ($name ?: 'hub-files') . '.zip');
            }
            $entry = $entries[0];
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="download"; filename*=UTF-8\'\'' . rawurlencode($entry['name']));
            header('Content-Length: ' . filesize($entry['path']));
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
            readfile($entry['path']);
            exit;

        case 'content.download':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail('GET required', 405);
            require __DIR__ . '/backup.php';
            downloadBackup(readData());

        case 'calendar.upload':
            $file = normalizedFiles('calendar')[0] ?? null;
            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('Choose an ICS file to upload.');
            $original = basename((string)($file['name'] ?? 'calendar.ics'));
            if (strtolower(pathinfo($original, PATHINFO_EXTENSION)) !== 'ics') fail('Calendar files must use the .ics extension.');
            $content = (string)file_get_contents((string)$file['tmp_name']);
            validateCalendarContent($content);
            foreach (glob(CALENDAR_DIR . '/*.ics') ?: [] as $existing) if (is_file($existing)) @unlink($existing);
            $base = preg_replace('/[^a-zA-Z0-9._-]+/', '-', pathinfo($original, PATHINFO_FILENAME));
            $name = trim((string)$base, '-_.') ?: 'calendar';
            $destination = CALENDAR_DIR . '/' . $name . '.ics';
            if (!move_uploaded_file((string)$file['tmp_name'], $destination)) fail('Unable to save the calendar file.', 500);
            response(calendarPayload());

        case 'calendar.delete':
            $path = calendarFilePath();
            if ($path && is_file($path) && !@unlink($path)) fail('Unable to delete the calendar file.', 500);
            response(calendarPayload());

        case 'settings.update':
            $input = bodyJson();
            $settings = [
                'theme' => in_array(($input['theme'] ?? 'umber'), ['umber','midnight-blue','bubblegum','caramel','marble','carbon-lavender'], true) ? $input['theme'] : 'umber',
                'mode' => in_array(($input['mode'] ?? 'dark'), ['dark','light'], true) ? $input['mode'] : 'dark',
            ];
            mutateData(function (&$data) use ($settings) { $data['settings'] = $settings; });
            response($settings);

        case 'links.inspect':
            response(inspectLinkMetadata(normalizeUrl((string)(bodyJson()['url'] ?? ''))));

        case 'media.inspect':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
            $remote = fetchPublicMedia(normalizeUrl((string)(bodyJson()['url'] ?? '')), 2097152, true);
            $mime = strtolower(explode(';', $remote['headers']['content-type'] ?? '')[0]);
            response(['direct'=>str_starts_with($mime, 'image/') || str_starts_with($mime, 'video/')]);

        case 'media.resolve':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
            response(resolveSocialMedia(normalizeUrl((string)(bodyJson()['url'] ?? ''))));

        case 'media.download':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
            $remote = fetchPublicMedia(normalizeUrl((string)(bodyJson()['url'] ?? '')), 67108864);
            $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($remote['body']);
            $extensions = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif','image/avif'=>'avif','image/bmp'=>'bmp','video/mp4'=>'mp4','video/webm'=>'webm','video/quicktime'=>'mov','video/ogg'=>'ogv'];
            if (!isset($extensions[$mime])) fail('This URL did not return a supported image or video.');
            header('Content-Type: '.$mime);
            header('Content-Disposition: attachment; filename="linked-media.'.$extensions[$mime].'"');
            header('Content-Length: '.strlen($remote['body']));
            header('X-Content-Type-Options: nosniff');
            echo $remote['body']; exit;

        case 'tmdb.search':
            $input = bodyJson();
            response(TmdbClient::configured()->search((string)($input['query'] ?? ''), (string)($input['type'] ?? ''), (int)($input['page'] ?? 1)));

        case 'tmdb.poster':
            $input = bodyJson();
            $poster = TmdbClient::configured()->poster((string)($input['type'] ?? ''), $input['id'] ?? '');
            header('Content-Type: '.$poster['mime']);
            header('Content-Disposition: attachment; filename="tmdb-poster.'.$poster['extension'].'"');
            header('Content-Length: '.strlen($poster['body']));
            header('X-Content-Type-Options: nosniff');
            echo $poster['body']; exit;

        case 'watchlist.status':
            $input = bodyJson();
            $status = $input['watchedStatus'] ?? '';
            if (!in_array($status, ['Not started','Completed'], true)) fail('Invalid watched status');
            $updated = mutateData(function (&$data) use ($input, $status) {
                foreach ($data['tiles'] as &$tile) {
                    if (($tile['id'] ?? '') !== ($input['id'] ?? '')) continue;
                    if (($tile['section'] ?? '') !== 'watchlist' || $tile['type'] !== 'entry') fail('This item is not a Watchlist entry');
                    $tile['watchedStatus'] = $status;
                    $tile['updatedAt'] = date(DATE_ATOM);
                    return $tile;
                }
                fail('Content no longer exists', 404);
            });
            response($updated);

        case 'tiles.create':
        case 'tiles.update':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
            $input = tileInput();
            $editing = $action === 'tiles.update';
            $existing = null;
            if ($editing) {
                $tileId = (string)($input['id'] ?? '');
                foreach (readData()['tiles'] as $candidate) if (($candidate['id'] ?? '') === $tileId) { $existing = $candidate; break; }
                if (!$existing) fail('Content no longer exists', 404);
            }
            $type = preg_replace('/[^a-z]/', '', $input['type'] ?? 'file');
            if (!in_array($type, ['link','text','image','video','audio','file','font','entry'], true)) fail('Invalid content type');
            if ($editing && $type !== $existing['type'] && !($existing['type'] === 'link' && in_array($type, ['image','video'], true))) fail('Content type cannot be changed');
            $section = $existing['section'] ?? (string)($input['section'] ?? 'dashboard');
            $tab = tabDefinition($section);
            if (!$tab) fail('Unknown tab');
            if ($type === 'entry' && ($tab['editor'] ?? 'content') !== 'entry') fail('This tab does not accept entries');
            if (($tab['editor'] ?? 'content') === 'entry' && $type !== 'entry') fail('This tab requires an entry');
            $customFields = validateTabFields($tab, $input);
            if ($type === 'entry' && trim((string)($input['label'] ?? '')) === '') fail('Name is required');
            $tileId = $existing['id'] ?? id('tile');
            $tile = [
                'id'=>$tileId, 'section'=>$section,
                'location'=>in_array($type, ['text','link'], true) ? '' : trim($input['location'] ?? ''),
                'dateAdded'=>$existing['dateAdded'] ?? $existing['createdAt'] ?? date(DATE_ATOM),
                'type'=>$type, 'label'=>trim($input['label'] ?? ''), 'description'=>trim($input['description'] ?? ''),
                'tags'=>cleanTags($input['tags'] ?? ''), 'size'=>in_array($input['size'] ?? '', ['small','medium','large'], true) ? $input['size'] : 'medium',
                'orientation'=>$tab['orientation'] ?? (in_array($input['orientation'] ?? '', ['landscape','portrait'], true) ? $input['orientation'] : 'landscape'), 'createdAt'=>$existing['createdAt'] ?? date(DATE_ATOM),
            ];
            $tile = array_merge($tile, $customFields);
            if ($section === 'watchlist' && ($tile['tmdbId'] ?? '') !== '') {
                TmdbClient::validateIdentity($tile['tmdbType'] ?? '', $tile['tmdbId']);
                if (($tile['mediaType'] === 'Movies' ? 'movie' : ($tile['mediaType'] === 'Series' ? 'tv' : '')) !== $tile['tmdbType']) fail('TMDB match does not match this media type');
                $tile['tmdbUrl'] = 'https://www.themoviedb.org/'.$tile['tmdbType'].'/'.$tile['tmdbId'];
            }
            if ($section === 'watchlist') {
                if (($tile['tmdbUrl'] ?? '') !== '' && !preg_match('~^https://www\.themoviedb\.org/(movie|tv)/[1-9][0-9]{0,9}$~D', $tile['tmdbUrl'])) fail('Invalid TMDB page URL');
                if (($tile['trailerUrl'] ?? '') !== '' && !preg_match('~^https://www\.youtube\.com/watch\?v=[a-zA-Z0-9_-]{11}$~D', $tile['trailerUrl'])) fail('Invalid YouTube trailer URL');
            }
            $retained = json_decode((string)($input['existingFiles'] ?? '[]'), true);
            if (!is_array($retained)) fail('Invalid saved file list');
            foreach ($retained as $path) if (!is_string($path) || !in_array($path, $existing['files'] ?? [], true)) fail('Invalid saved file reference');
            $retainedThumbnail = (string)($input['existingThumbnail'] ?? '');
            if ($retainedThumbnail !== '' && $retainedThumbnail !== ($existing['thumbnail'] ?? '')) fail('Invalid saved thumbnail reference');
            $files = array_values(array_unique(array_merge($retained, storeMany($tileId, 'draggedFiles', 'files'))));
            if (in_array($type, ['image','video','audio','file','font'], true) && !$files) fail('Choose at least one file');
            $thumbnail = normalizedFiles('thumbnail');
            $thumbPath = $thumbnail ? storeUpload($thumbnail[0], $tileId) : null;
            if (in_array($type, ['text','link','entry'], true) && $files) fail('Text and URL content accept one thumbnail only');
            if ($files) $tile['files'] = $files;
            $tile['fileMetadata'] = [];
            $metadataTags = [];
            foreach ($files as $path) {
                $meta = $existing['fileMetadata'][$path] ?? mediaMetadata(__DIR__ . '/' . $path);
                $tile['fileMetadata'][$path] = $meta;
                $metadataTags = array_merge($metadataTags, $meta['tags'] ?? []);
            }
            $tile['metadataTags'] = array_values(array_unique($metadataTags));
            if ($thumbPath || $retainedThumbnail) $tile['thumbnail'] = $thumbPath ?: $retainedThumbnail;
            if ($type === 'text') {
                $color = filter_var($input['backgroundColor'] ?? null, FILTER_VALIDATE_INT);
                $tile['backgroundColor'] = ($color !== false && $color !== null && $color >= 0 && $color <= 8) ? $color : random_int(0, 8);
            }
            if ($type === 'link') {
                $tile['url'] = normalizeUrl((string)($input['url'] ?? ''));
                if (!publicHttpUrl($tile['url'])) fail('A valid HTTP or HTTPS URL is required');
                $backgrounds = urlBackgrounds();
                $background = (string)($input['urlBackground'] ?? '');
                if ($background !== '' && !in_array($background, $backgrounds, true)) fail('Invalid URL background');
                if (!$background && $backgrounds) $background = $backgrounds[array_rand($backgrounds)];
                if ($background) $tile['urlBackground'] = $background;
                $tile['faviconUrl'] = publicHttpUrl((string)($input['faviconUrl'] ?? '')) ?: absolutePageUrl($tile['url'], '/favicon.ico');
                $tile['linkTitle'] = cleanPageTitle((string)($input['linkTitle'] ?? ''));
                if (!$tile['label']) $tile['label'] = $tile['linkTitle'] ?: (parse_url($tile['url'], PHP_URL_HOST) ?: $tile['url']);
                if (!$tile['description']) $tile['description'] = $tile['url'];
            }
            if ($type === 'link' && !empty($input['embedUrl'])) {
                $social = socialMediaInfo($tile['url']);
                if (!$social || $social['embedUrl'] !== $input['embedUrl']) fail('Invalid media embed URL');
                $tile['embedUrl'] = $social['embedUrl'];
                $tile['provider'] = $social['provider'];
                $tile['embedWidth'] = max(0, min(10000, (int)($input['embedWidth'] ?? 0)));
                $tile['embedHeight'] = max(0, min(10000, (int)($input['embedHeight'] ?? 0)));
                $tile['mediaWidth'] = max(0, min(20000, (int)($input['mediaWidth'] ?? 0)));
                $tile['mediaHeight'] = max(0, min(20000, (int)($input['mediaHeight'] ?? 0)));
            }
            if ($type === 'text') {
                $tile['text'] = $input['text'] ?? '';
                $tile['textStyle'] = ['font'=>trim($input['font'] ?? 'Arial, sans-serif'),'fontSize'=>(int)($input['fontSize'] ?? 28),'bold'=>isset($input['bold']),'italic'=>isset($input['italic']),'underline'=>isset($input['underline']),'align'=>in_array($input['align'] ?? '', ['left','center','right'], true) ? $input['align'] : 'left'];
            }
            if ($editing) $tile['updatedAt'] = date(DATE_ATOM);
            mutateData(function (&$data) use ($tile, $editing) {
                if (!$editing) { array_unshift($data['tiles'], $tile); return; }
                foreach ($data['tiles'] as $index => $stored) {
                    if (($stored['id'] ?? '') === $tile['id']) { $data['tiles'][$index] = $tile; return; }
                }
                fail('Content no longer exists', 404);
            });
            if ($editing) {
                $removed = array_diff($existing['files'] ?? [], $tile['files'] ?? []);
                if (($existing['thumbnail'] ?? '') !== ($tile['thumbnail'] ?? '')) $removed[] = $existing['thumbnail'] ?? '';
                deleteUploads($removed);
            }
            response($tile, $editing ? 200 : 201);

        case 'fonts.upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
            $upload = normalizedFiles('font')[0] ?? null;
            if (!$upload) fail('Choose a font file');
            $font = mutateData(function (&$data) use ($upload) {
                $font = storeFont($upload, trim((string)($_POST['name'] ?? '')), $data['fonts'] ?? []);
                $data['fonts'][] = $font;
                return $font;
            });
            response($font, 201);

        case 'tiles.delete':
            $input = bodyJson(); $tileId = (string)($input['id'] ?? ''); if (!$tileId) fail('Missing tile id');
            $doomed = [];
            foreach (readData()['tiles'] as $candidate) if (($candidate['id'] ?? '') === $tileId) { $doomed = array_merge($candidate['files'] ?? [], [$candidate['thumbnail'] ?? '']); break; }
            mutateData(function (&$data) use ($tileId) {
                $data['tiles'] = array_values(array_filter($data['tiles'], fn($tile) => ($tile['id'] ?? '') !== $tileId));
                $data['bookmarks'] = array_values(array_filter($data['bookmarks'], fn($id) => $id !== $tileId));
                if (isset($data['collections']) && is_array($data['collections'])) foreach ($data['collections'] as &$collection) $collection['items'] = array_values(array_filter($collection['items'] ?? [], fn($id) => $id !== $tileId));
            }); deleteUploads($doomed); response(['id'=>$tileId]);

        case 'toplinks.create':
        case 'toplinks.update':
            $editing = $action === 'toplinks.update';
            $existing = null;
            if ($editing) {
                $linkId = (string)($_POST['id'] ?? '');
                foreach (readData()['topLinks'] as $candidate) if ($candidate['id'] === $linkId) { $existing = $candidate; break; }
                if (!$existing) fail('Top link no longer exists', 404);
            }
            $label = trim($_POST['label'] ?? ''); $url = normalizeUrl((string)($_POST['url'] ?? ''));
            if (!$label || !$url) fail('Label and URL are required');
            $retainedImage = (string)($_POST['existingImage'] ?? '');
            if ($retainedImage !== '' && $retainedImage !== ($existing['image'] ?? '')) fail('Invalid saved image reference');
            $linkId = $existing['id'] ?? id('link');
            $imageFiles = normalizedFiles('image'); $image = $imageFiles ? storeUpload($imageFiles[0], $linkId) : null;
            $link = ['id'=>$linkId,'label'=>$label,'url'=>$url,'image'=>$image ?: $retainedImage];
            mutateData(function (&$data) use ($link, $editing) {
                if (!$editing) { $data['topLinks'][] = $link; return; }
                foreach ($data['topLinks'] as $index => $stored) {
                    if ($stored['id'] === $link['id']) { $data['topLinks'][$index] = $link; return; }
                }
                fail('Top link no longer exists', 404);
            });
            if ($editing && ($existing['image'] ?? '') !== $link['image']) deleteUploads([$existing['image'] ?? '']);
            response($link, $editing ? 200 : 201);

        case 'toplinks.delete':
            $input = bodyJson(); $linkId = (string)($input['id'] ?? '');
            $doomed = [];
            foreach (readData()['topLinks'] as $candidate) if (($candidate['id'] ?? '') === $linkId) { $doomed = [$candidate['image'] ?? '']; break; }
            mutateData(function (&$data) use ($linkId) { $data['topLinks'] = array_values(array_filter($data['topLinks'], fn($link) => ($link['id'] ?? '') !== $linkId)); });
            deleteUploads($doomed); response(['id'=>$linkId]);

        case 'bookmarks.update':
            $ids = bodyJson()['ids'] ?? []; if (!is_array($ids)) fail('ids must be an array');
            mutateData(function (&$data) use ($ids) {
                $known = array_column($data['tiles'], 'id');
                $data['bookmarks'] = array_values(array_unique(array_filter($ids, fn($id) => in_array($id, $known, true))));
            }); response($ids);

        case 'collections.update':
            $input = bodyJson(); $collections = $input['collections'] ?? []; if (!is_array($collections)) fail('collections must be an array');
            $saved = mutateData(function (&$data) use ($collections) {
                $out = []; $ids = [];
                $tilesById = array_column($data['tiles'], null, 'id');
                foreach (array_slice($collections, 0, 200) as $i => $collection) {
                    if (!is_array($collection)) continue; $name = trim((string)($collection['name'] ?? 'Collection')); if ($name === '') $name = 'Collection';
                    $cid = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($collection['id'] ?? '')) ?: id('collection');
                    $section = (string)($collection['section'] ?? 'dashboard');
                    if (!tabDefinition($section)) fail('Unknown collection tab');
                    if (isset($ids[$cid])) fail('Duplicate collection ID');
                    $ids[$cid] = true;
                    $rawItems = $collection['items'] ?? [];
                    if (!is_array($rawItems)) fail('Collection items must be an array');
                    $items = array_values(array_unique(array_filter($rawItems, fn($tileId) => is_string($tileId) && isset($tilesById[$tileId]) && ($tilesById[$tileId]['section'] ?? 'dashboard') === $section))); 
                    $out[] = ['id'=>$cid,'section'=>$section,'name'=>substr($name,0,60),'collapsed'=>(bool)($collection['collapsed'] ?? false),'items'=>$items];
                }
                $data['collections'] = $out; return $out;
            }); response($saved);

        default: fail('Unknown action', 404);
    }
} catch (InvalidArgumentException $e) {
    fail($e->getMessage(), 400);
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
