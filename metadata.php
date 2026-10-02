<?php
declare(strict_types=1);

/** Best-effort extraction: no metadata is inferred from file modification dates. */
function mediaMetadata(string $path): array {
    $out = ['tags' => []];
    $info = [];
    $size = @getimagesize($path, $info);
    if ($size) { $out['width'] = $size[0]; $out['height'] = $size[1]; }
    if (isset($info['APP13']) && function_exists('iptcparse')) {
        $iptc = @iptcparse($info['APP13']) ?: [];
        $out['tags'] = $iptc['2#025'] ?? [];
        $day = $iptc['2#055'][0] ?? '';
        if (preg_match('/^\d{8}$/', $day)) $out['dateTaken'] = substr($day,0,4).'-'.substr($day,4,2).'-'.substr($day,6,2);
    }
    if ($size && function_exists('exif_read_data') && in_array($size[2], [IMAGETYPE_JPEG, IMAGETYPE_TIFF_II, IMAGETYPE_TIFF_MM], true)) {
        $exif = @exif_read_data($path, null, true) ?: [];
        $ifd = $exif['IFD0'] ?? [];
        $taken = $exif['EXIF']['DateTimeOriginal'] ?? $exif['EXIF']['DateTimeDigitized'] ?? null;
        if ($taken) $out['dateTaken'] = preg_replace('/^(\d{4}):(\d{2}):(\d{2})/', '$1-$2-$3', (string)$taken);
        $unit = (int)($ifd['ResolutionUnit'] ?? 0);
        $rational = static function ($value): float {
            $parts = explode('/', (string)$value);
            return count($parts) === 2 ? ((float)$parts[1] ? (float)$parts[0] / (float)$parts[1] : 0) : (float)$value;
        };
        $x = $rational($ifd['XResolution'] ?? 0); $y = $rational($ifd['YResolution'] ?? 0);
        if ($x > 0 && $y > 0 && in_array($unit, [2,3], true)) {
            $factor = $unit === 3 ? 2.54 : 1;
            $out['dpi'] = round($x*$factor,2).' × '.round($y*$factor,2);
        }
        if (!empty($ifd['XPKeywords']) && function_exists('iconv')) {
            $keywords = @iconv('UTF-16LE', 'UTF-8//IGNORE', (string)$ifd['XPKeywords']);
            if ($keywords) $out['tags'] = array_merge($out['tags'], explode(';', trim($keywords, "\0")));
        }
    }
    // Read a bounded prefix for embedded XMP and PNG physical resolution.
    $head = (string)@file_get_contents($path, false, null, 0, 2097152);
    if (str_starts_with($head, "\x89PNG\r\n\x1a\n")) {
        for ($offset = 8; $offset + 12 <= strlen($head);) {
            $length = unpack('N', substr($head,$offset,4))[1];
            if ($length > strlen($head) - $offset - 12) break;
            if (substr($head,$offset+4,4) === 'pHYs' && $length === 9 && ord($head[$offset+16]) === 1) {
                $density = unpack('Nx/Ny', substr($head,$offset+8,8));
                $out['dpi'] = round($density['x'] * .0254,2).' × '.round($density['y'] * .0254,2);
            }
            $offset += $length + 12;
        }
    }
    if (preg_match('~<dc:subject\b[^>]*>(.*?)</dc:subject>~s', $head, $subjects)) {
        preg_match_all('~<rdf:li\b[^>]*>(.*?)</rdf:li>~s', $subjects[1], $tags);
        foreach ($tags[1] as $tag) $out['tags'][] = html_entity_decode(strip_tags($tag), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
    if (preg_match('~(?:exif:DateTimeOriginal|photoshop:DateCreated)=["\x27]([^"\x27]+)~', $head, $date)) $out['dateTaken'] = $date[1];
    // ffprobe is optional. Use an argument array, a fixed executable, and a timeout.
    $probe = is_executable('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : (is_executable('/usr/local/bin/ffprobe') ? '/usr/local/bin/ffprobe' : null);
    if (!$size && $probe && function_exists('proc_open')) {
        $process = @proc_open([$probe, '-v', 'quiet', '-protocol_whitelist', 'file', '-show_entries', 'stream=codec_type,width,height:stream_tags=creation_time,keywords:format_tags=creation_time,keywords,subject', '-of', 'json', $path], [0=>['pipe','r'],1=>['pipe','w'],2=>['file','/dev/null','w']], $pipes);
        if (is_resource($process)) {
            fclose($pipes[0]); stream_set_blocking($pipes[1], false);
            $json = ''; $deadline = microtime(true) + 3;
            do {
                $json .= stream_get_contents($pipes[1]);
                $running = proc_get_status($process)['running'];
                if (!$running || strlen($json) > 1048576) break;
                usleep(10000);
            } while (microtime(true) < $deadline);
            if ($running) proc_terminate($process, 9);
            $json .= stream_get_contents($pipes[1]); fclose($pipes[1]); proc_close($process);
            $media = json_decode($json, true) ?: [];
            $tags = $media['format']['tags'] ?? [];
            foreach ($media['streams'] ?? [] as $stream) {
                $tags = array_merge($stream['tags'] ?? [], $tags);
                if (($stream['codec_type'] ?? '') === 'video' && !isset($out['width'])) { $out['width'] = $stream['width'] ?? null; $out['height'] = $stream['height'] ?? null; }
            }
            if (!empty($tags['creation_time'])) $out['dateTaken'] = $tags['creation_time'];
            foreach (['keywords','subject'] as $key) if (!empty($tags[$key])) $out['tags'] = array_merge($out['tags'], preg_split('/[,;]/', $tags[$key]));
        }
    }
    $clean = [];
    foreach ($out['tags'] as $tag) {
        $tag = trim((string)$tag);
        if ($tag === '' || !preg_match('//u', $tag)) continue;
        $tag = function_exists('mb_substr') ? mb_substr($tag, 0, 120) : $tag;
        $clean[strtolower($tag)] = $tag;
    }
    $out['tags'] = array_slice(array_values($clean), 0, 50);
    return $out;
}
