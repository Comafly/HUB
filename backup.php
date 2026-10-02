<?php
declare(strict_types=1);
// This helper is only callable through the app API.
if (!defined('DATA_FILE')) { http_response_code(404); exit; }

/** Build a portable, uncompressed ZIP on disk without requiring ext-zip. */
function downloadBackup(array $data): never {
    $entries = [
        ['name'=>'data/app.json', 'text'=>json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
        ['name'=>'data/.htaccess', 'text'=>"Require all denied\n"],
        ['name'=>'uploads/', 'text'=>''],
    ];
    $root = realpath(UPLOAD_DIR);
    if ($root) {
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->isLink()) continue;
            $path = $file->getRealPath();
            if (!$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR)) continue;
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($path, strlen($root) + 1));
            $entries[] = ['name'=>'uploads/' . $relative, 'path'=>$path];
        }
    }
    $fontRoot = realpath(FONT_DIR);
    if ($fontRoot) {
        $entries[] = ['name'=>'assets/fonts/', 'text'=>''];
        foreach (new DirectoryIterator($fontRoot) as $file) {
            if (!$file->isFile() || $file->isLink() || $file->getFilename()[0] === '.') continue;
            $entries[] = ['name'=>'assets/fonts/' . $file->getFilename(), 'path'=>$file->getRealPath()];
        }
    }
    downloadZipEntries($entries, 'hub-content-' . gmdate('Y-m-d-His') . '.zip');
}

function downloadZipEntries(array $entries, string $filename): never {
    $zip = tmpfile();
    if (!$zip) fail('Unable to create the ZIP temporary file', 500);
    // ZIP32 bounds are enforced before sending any download headers.
    if (count($entries) >= 65535) fail('This backup has too many files for the built-in ZIP exporter', 413);
    $central = '';
    $now = getdate();
    $time = ($now['hours'] << 11) | ($now['minutes'] << 5) | intdiv($now['seconds'], 2);
    $date = ((max(1980, $now['year']) - 1980) << 9) | ($now['mon'] << 5) | $now['mday'];
    foreach ($entries as $entry) {
        $name = $entry['name'];
        $input = isset($entry['path']) ? fopen($entry['path'], 'rb') : null;
        if (isset($entry['path']) && !$input) fail('Unable to read an uploaded file for the backup', 500);
        $offset = ftell($zip);
        // Data descriptors allow each file to be hashed and copied once, in chunks.
        $flags = 0x0808; // UTF-8 names, data descriptor follows file bytes.
        backupWrite($zip, pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, 0, $time, $date, 0, 0, 0, strlen($name), 0) . $name);
        $hash = hash_init('crc32b');
        $size = 0;
        if ($input) {
            while (!feof($input)) {
                $chunk = fread($input, 1024 * 1024);
                if ($chunk === false) fail('Unable to read an uploaded file for the backup', 500);
                hash_update($hash, $chunk); $size += strlen($chunk);
                if ($size >= 0xffffffff || ftell($zip) + strlen($chunk) >= 0xffffffff) fail('Backup exceeds the 4 GB ZIP limit', 413);
                backupWrite($zip, $chunk);
            }
            fclose($input);
        } else {
            $text = $entry['text']; $size = strlen($text); hash_update($hash, $text); backupWrite($zip, $text);
        }
        $crc = (int)hexdec(hash_final($hash));
        backupWrite($zip, pack('VVVV', 0x08074b50, $crc, $size, $size));
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, $flags, 0, $time, $date, $crc, $size, $size, strlen($name), 0, 0, 0, 0, str_ends_with($name, '/') ? 16 : 0, $offset) . $name;
    }
    $offset = ftell($zip);
    if ($offset + strlen($central) + 22 >= 0xffffffff) fail('Backup exceeds the 4 GB ZIP limit', 413);
    backupWrite($zip, $central . pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($central), $offset, 0));
    $length = ftell($zip); rewind($zip);
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . $length);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    fpassthru($zip); fclose($zip); exit;
}
function backupWrite($stream, string $bytes): void {
    $length = strlen($bytes); $offset = 0;
    while ($offset < $length) {
        $written = fwrite($stream, substr($bytes, $offset));
        if ($written === false || $written === 0) fail('Not enough temporary disk space for the backup', 500);
        $offset += $written;
    }
}
