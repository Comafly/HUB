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
            if (!in_array($type, ['link','text','image','video','audio','file','font'], true)) fail('Invalid content type');
            if ($editing && $type !== $existing['type']) fail('Content type cannot be changed');
            $tileId = $existing['id'] ?? id('tile');
            $tile = [
                'id'=>$tileId, 'section'=>in_array($input['section'] ?? '', ['dashboard','projects','resources'], true) ? $input['section'] : 'dashboard',
                'location'=>trim($input['location'] ?? ''),
                'dateAdded'=>$existing['dateAdded'] ?? $existing['createdAt'] ?? date(DATE_ATOM),
                'type'=>$type, 'label'=>trim($input['label'] ?? ''), 'description'=>trim($input['description'] ?? ''),
                'tags'=>cleanTags($input['tags'] ?? ''), 'size'=>in_array($input['size'] ?? '', ['small','medium','large'], true) ? $input['size'] : 'medium',
                'orientation'=>in_array($input['orientation'] ?? '', ['landscape','portrait'], true) ? $input['orientation'] : 'landscape', 'createdAt'=>$existing['createdAt'] ?? date(DATE_ATOM),
            ];
            $retained = json_decode((string)($input['existingFiles'] ?? '[]'), true);
            if (!is_array($retained)) fail('Invalid saved file list');
            foreach ($retained as $path) if (!is_string($path) || !in_array($path, $existing['files'] ?? [], true)) fail('Invalid saved file reference');
            $retainedThumbnail = (string)($input['existingThumbnail'] ?? '');
            if ($retainedThumbnail !== '' && $retainedThumbnail !== ($existing['thumbnail'] ?? '')) fail('Invalid saved thumbnail reference');
            $files = array_values(array_unique(array_merge($retained, storeMany($tileId, 'draggedFiles', 'files'))));
            if (in_array($type, ['image','video','audio','file','font'], true) && !$files) fail('Choose at least one file');
            $thumbnail = normalizedFiles('thumbnail');
            $thumbPath = $thumbnail ? storeUpload($thumbnail[0], $tileId) : null;
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
            if ($type === 'link') { $tile['url'] = normalizeUrl((string)($input['url'] ?? '')); if (!$tile['url']) fail('A valid URL is required'); }
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
                $known = array_column($data['tiles'], 'id'); $out = [];
                foreach (array_slice($collections, 0, 40) as $i => $collection) {
                    if (!is_array($collection)) continue; $name = trim((string)($collection['name'] ?? 'Collection')); if ($name === '') $name = 'Collection';
                    $cid = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($collection['id'] ?? '')) ?: id('collection');
                    $items = array_values(array_unique(array_filter($collection['items'] ?? [], fn($tileId) => in_array($tileId, $known, true))));
                    $out[] = ['id'=>$cid,'name'=>substr($name,0,60),'collapsed'=>(bool)($collection['collapsed'] ?? false),'items'=>$items];
                }
                $data['collections'] = $out; return $out;
            }); response($saved);

        default: fail('Unknown action', 404);
    }
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
