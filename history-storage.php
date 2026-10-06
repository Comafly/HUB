<?php
declare(strict_types=1);

// All readers and writers share one lock. A durable journal makes a multi-file
// rollover recoverable if PHP stops between writing an archive and app.json.
function storageJson(string $path): array {
    $value = json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException('Invalid data file: '.basename($path));
    return $value;
}
function storageWrite(string $path, array $data): void {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $tmp = $path.'.tmp';
    if (file_put_contents($tmp, $json) !== strlen($json) || !rename($tmp, $path)) throw new RuntimeException('Unable to save '.basename($path));
}
function historyFilename(string $month): string {
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/D', $month)) throw new RuntimeException('Invalid history month');
    [$year, $number] = explode('-', $month);
    return 'dashboard-'.$number.'-'.$year.'.json';
}
function storageReplay(array $files): void {
    foreach ($files as $name => $data) {
        if ($name !== 'app.json' && !preg_match('/^dashboard-(0[1-9]|1[0-2])-\d{4}\.json$/D', $name)) throw new RuntimeException('Invalid storage journal');
        storageWrite(dirname(DATA_FILE).'/'.$name, $data);
    }
}
function storagePartitions(array $data): array {
    $archives = []; $current = [];
    foreach ($data['tiles'] as $tile) {
        $month = $tile['historyMonth'] ?? null;
        if ($month && ($tile['section'] ?? 'dashboard') === 'dashboard') {
            $name = historyFilename($month);
            $archives[$name] ??= ['month'=>$month, 'tiles'=>[]];
            $archives[$name]['tiles'][] = $tile;
        } else { unset($tile['historyMonth']); $current[] = $tile; }
    }
    // Preserve empty archives after the last archived item is deleted.
    foreach ($data['history'] ?? [] as $entry) {
        $name = historyFilename($entry['month']);
        $archives[$name] ??= ['month'=>$entry['month'], 'tiles'=>[]];
    }
    $data['tiles'] = $current;
    unset($data['history']);
    $archives['app.json'] = $data;
    return $archives;
}
function storageTransaction(?callable $callback = null): mixed {
    ensureStorage();
    $root = dirname(DATA_FILE);
    $lock = fopen($root.'/storage.lock', 'c+');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock storage');
    try {
        $journal = $root.'/storage-journal.json';
        if (is_file($journal)) {
            storageReplay(storageJson($journal));
            if (!unlink($journal)) throw new RuntimeException('Unable to complete storage recovery');
        }
        if (!is_file(DATA_FILE)) storageWrite(DATA_FILE, defaultData());
        $data = array_replace(defaultData(), storageJson(DATA_FILE));
        $data['history'] = [];
        $byId = [];
        foreach ($data['tiles'] as $tile) $byId[$tile['id']] = $tile;
        foreach (glob($root.'/dashboard-??-????.json') ?: [] as $file) {
            $archive = storageJson($file);
            $month = $archive['month'];
            historyFilename($month);
            $data['history'][] = ['month'=>$month];
            foreach ($archive['tiles'] as $tile) {
                $tile['historyMonth'] = $month;
                $byId[$tile['id']] = $tile;
            }
        }
        $data['tiles'] = array_values($byId);
        $zone = new DateTimeZone(getenv('HUB_TIMEZONE') ?: 'Australia/Perth');
        $now = new DateTimeImmutable('now', $zone);
        $currentMonth = $now->format('Y-m');
        $changed = false;
        foreach ($data['tiles'] as &$tile) {
            if (($tile['section'] ?? 'dashboard') !== 'dashboard' || !empty($tile['historyMonth'])) continue;
            $created = $tile['createdAt'] ?? $tile['dateAdded'] ?? null;
            // Undated legacy tiles stay current until the next rollover.
            if (!$created) { if (!isset($tile['archiveEligibleMonth'])) { $tile['archiveEligibleMonth'] = $currentMonth; $changed = true; } $month = $tile['archiveEligibleMonth']; }
            else {
                try { $month = (new DateTimeImmutable($created, $zone))->setTimezone($zone)->format('Y-m'); }
                catch (Throwable $error) { if (!isset($tile['archiveEligibleMonth'])) { $tile['archiveEligibleMonth'] = $currentMonth; $changed = true; } $month = $tile['archiveEligibleMonth']; }
            }
            if ($month < $currentMonth) { $tile['historyMonth'] = $month; $changed = true; }
        }
        unset($tile);
        $result = $callback ? $callback($data) : null;
        $months = array_column($data['history'], 'month');
        foreach ($data['tiles'] as $tile) if (!empty($tile['historyMonth'])) $months[] = $tile['historyMonth'];
        $months = array_values(array_unique($months)); rsort($months);
        $data['history'] = array_map(static fn($month) => ['month'=>$month, 'filename'=>historyFilename($month), 'count'=>count(array_filter($data['tiles'], static fn($tile) => ($tile['historyMonth'] ?? null) === $month))], $months);
        if ($changed || $callback) {
            $files = storagePartitions($data);
            storageWrite($journal, $files);
            storageReplay($files);
            if (!unlink($journal)) throw new RuntimeException('Unable to complete storage transaction');
        }
        return $callback ? $result : $data;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
