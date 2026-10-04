<?php
declare(strict_types=1);

/** Fixed-host TMDB client. Credentials never enter browser responses or cache keys. */
final class TmdbClient {
    public function __construct(private string $readAccessToken, private ?string $cacheDir = null, private $transport = null) {}

    public static function configured(): self {
        $configFile = __DIR__.'/data/tmdb-config.php';
        $config = is_file($configFile) ? require $configFile : [];
        $token = trim((string)(getenv('HUB_TMDB_READ_ACCESS_TOKEN') ?: ($config['readAccessToken'] ?? '')));
        if ($token === '') throw new RuntimeException('Configure the TMDB read access token on the server.');
        if (!preg_match('/^[A-Za-z0-9._~-]+$/D', $token)) throw new RuntimeException('Invalid TMDB read access token format.');
        return new self($token, __DIR__.'/data/tmdb-cache');
    }

    public static function validateIdentity(string $type, mixed $id): int {
        if (!in_array($type, ['movie', 'tv'], true) || !preg_match('/^[1-9][0-9]{0,9}$/', (string)$id)) throw new InvalidArgumentException('Invalid TMDB title or media type.');
        return (int)$id;
    }

    private function request(string $path, array $params = []): array {
        $cache = $this->cacheDir ? $this->cacheDir.'/'.hash('sha256', $path.json_encode($params)).'.json' : null;
        if ($cache && is_file($cache) && filemtime($cache) > time()-3600) {
            $cached = json_decode((string)file_get_contents($cache), true);
            if (is_array($cached)) return $cached;
        }
        if ($this->transport) $payload = ($this->transport)($path, $params);
        else {
            $remote = $this->download('https://api.themoviedb.org/3'.$path.'?'.http_build_query($params+['language'=>'en-US']), 4194304, [
                'Accept: application/json',
                'Authorization: Bearer '.$this->readAccessToken,
            ]);
            $payload = json_decode($remote, true);
            if (!is_array($payload)) throw new RuntimeException('TMDB returned an invalid response. Please try again.');
        }
        if ($cache) {
            if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir, 0700, true);
            @file_put_contents($cache, json_encode($payload), LOCK_EX);
        }
        return $payload;
    }

    private function download(string $url, int $limit, array $headers = ['Accept: image/*']): string {
        if (!function_exists('curl_init')) throw new RuntimeException('TMDB lookup requires the PHP cURL extension.');
        $ch = curl_init($url); $body = ''; $tooLarge = false;
        curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION=>false, CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_TIMEOUT=>10, CURLOPT_USERAGENT=>'COMMA-HUB/1.0', CURLOPT_HTTPHEADER=>$headers, CURLOPT_WRITEFUNCTION=>static function($ch, $chunk) use (&$body, &$tooLarge, $limit) {
            if (strlen($body)+strlen($chunk)>$limit) { $tooLarge=true; return 0; }
            $body .= $chunk; return strlen($chunk);
        }]);
        $ok = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $curlError = curl_errno($ch); curl_close($ch);
        if ($tooLarge) throw new RuntimeException('The TMDB response is too large.', 413);
        if ($status === 401 || $status === 403) throw new RuntimeException('TMDB rejected the configured read access token. Check the server configuration.', $status);
        if ($status === 429) throw new RuntimeException('TMDB is temporarily limiting requests. Please try again shortly.', 429);
        if ($status === 404) throw new RuntimeException('This result is no longer available on TMDB.', 404);
        if ($ok === false) {
            $message = $curlError === 28 ? 'The TMDB request timed out. Please try again.' : 'Could not connect to TMDB (cURL error '.$curlError.'). Please try again.';
            throw new RuntimeException($message, $curlError);
        }
        if ($status !== 200) throw new RuntimeException('TMDB returned HTTP '.$status.'. Please try again.', $status);
        return $body;
    }

    private function details(string $type, mixed $id): array {
        $id = self::validateIdentity($type, $id);
        return $this->request('/'.$type.'/'.$id, ['append_to_response'=>'credits']);
    }

    private function normalize(array $item, string $type): array {
        $authors = [];
        foreach ($item['credits']['crew'] ?? [] as $person) if (($person['job'] ?? '') === 'Director') $authors[] = $person['name'];
        if ($type === 'tv') {
            $creators = array_column($item['created_by'] ?? [], 'name');
            if ($creators) $authors = $creators;
        }
        $date = (string)($item[$type === 'movie' ? 'release_date' : 'first_air_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = '';
        $poster = $item['poster_path'] ?? '';
        return ['id'=>(int)$item['id'], 'name'=>(string)($item[$type === 'movie' ? 'title' : 'name'] ?? ''), 'description'=>(string)($item['overview'] ?? ''), 'releaseDate'=>$date, 'year'=>$date ? substr($date,0,4) : '', 'author'=>implode(', ', array_unique($authors)), 'hasPoster'=>is_string($poster) && preg_match('~^/[a-zA-Z0-9_-]+\.(jpg|png|webp)$~', $poster) === 1];
    }

    public function search(string $query, string $type, int $page = 1): array {
        $query = trim($query);
        if ($query === '' || strlen($query)>300 || !in_array($type, ['movie','tv'], true) || $page<1 || $page>1500) throw new InvalidArgumentException('Enter a title and choose Movie or Series.');
        // Present up to seven complete records per page, including directors/creators.
        $providerPage = intdiv($page-1, 3)+1;
        $response = $this->request('/search/'.$type, ['query'=>$query, 'include_adult'=>'false', 'page'=>$providerPage]);
        $offset = (($page-1)%3)*7;
        $results = [];
        foreach (array_slice($response['results'] ?? [], $offset, 7) as $item) {
            try {
                $details = $this->details($type, $item['id']);
            } catch (RuntimeException $error) {
                // Search can include stale/deleted records. Keep the other matches.
                if ($error->getCode() === 404) continue;
                throw $error;
            }
            $results[] = $this->normalize($details, $type);
        }
        $total = min((int)($response['total_results'] ?? 0), 10000);
        // TMDB serves 20 records per provider page; the last local page has six.
        $fullPages = intdiv($total,20); $remaining = $total%20;
        $pages = max(1, min(1500, $fullPages*3 + ($remaining ? (int)ceil($remaining/7) : 0)));
        return ['page'=>$page, 'pages'=>$pages, 'results'=>$results];
    }

    public function poster(string $type, mixed $id): array {
        $item = $this->details($type, $id);
        $path = $item['poster_path'] ?? '';
        if (!is_string($path) || !preg_match('~^/[a-zA-Z0-9_-]+\.(jpg|png|webp)$~', $path)) throw new RuntimeException('This title has no poster on TMDB. Upload a cover instead.');
        $body = $this->download('https://image.tmdb.org/t/p/w500'.$path, 10485760);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($body);
        $extensions = ['image/jpeg'=>'jpg', 'image/png'=>'png', 'image/webp'=>'webp'];
        if (!isset($extensions[$mime])) throw new RuntimeException('TMDB did not return a supported poster image.');
        return ['body'=>$body, 'mime'=>$mime, 'extension'=>$extensions[$mime]];
    }
}
