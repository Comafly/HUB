<?php
declare(strict_types=1);

/** Shared JSON configuration is the only place a standard tab is registered. */
function tabDefinitions(): array {
    static $tabs = null;
    if ($tabs !== null) return $tabs;
    $decoded = json_decode(file_get_contents(__DIR__.'/config/tabs.json'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($decoded) || !array_is_list($decoded) || !$decoded) throw new RuntimeException('Configure at least one tab.');
    $ids = [];
    foreach ($decoded as $tab) {
        $id = $tab['id'] ?? '';
        if (!is_string($id) || !preg_match('/^[a-z][a-z0-9_-]*$/', $id) || isset($ids[$id])) throw new RuntimeException('Tab IDs must be unique lowercase slugs.');
        $ids[$id] = true;
        if (empty($tab['title']) || !in_array($tab['editor'] ?? 'content', ['content','entry'], true)) throw new RuntimeException('Invalid tab title or editor.');
        if (empty($tab['views']) || array_diff($tab['views'], ['asymmetric','equal','list'])) throw new RuntimeException('Invalid tab views.');
        $names = [];
        $reserved = ['id','section','type','label','description','location','dateAdded','createdAt','updatedAt','files','thumbnail','tags','metadataTags','fileMetadata','text','textStyle','url','embedUrl','size','orientation','existingFiles','existingThumbnail','backgroundColor','urlBackground','faviconUrl','linkTitle','font','fontSize','bold','italic','underline','align','embedWidth','embedHeight','mediaWidth','mediaHeight','metadata'];
        foreach ($tab['fields'] ?? [] as $field) {
            $name = $field['name'] ?? '';
            if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]*$/', $name) || in_array($name, $reserved, true) || isset($names[$name])) throw new RuntimeException('Custom field names must be unique and cannot replace standard fields.');
            $names[$name] = true;
            if (!in_array($field['type'] ?? '', ['text','textarea','date','select','checkbox'], true)) throw new RuntimeException('Unsupported custom field type.');
            if ($field['type'] === 'select' && empty($field['options'])) throw new RuntimeException('Select fields require options.');
        }
    }
    return $tabs = $decoded;
}

function tabDefinition(string $id): ?array {
    foreach (tabDefinitions() as $tab) if ($tab['id'] === $id) return $tab;
    return null;
}

function validateTabFields(array $tab, array $input): array {
    $out = [];
    foreach ($tab['fields'] ?? [] as $field) {
        $name = $field['name'];
        if ($field['type'] === 'checkbox') {
            $out[$name] = in_array($input[$name] ?? false, [true, 'true', 'on', '1', 1], true);
            if (!empty($field['required']) && !$out[$name]) fail($field['label'].' is required');
            continue;
        }
        $raw = $input[$name] ?? $field['default'] ?? '';
        if (!is_string($raw)) fail('Invalid value for '.$field['label']);
        $value = trim($raw);
        if (!empty($field['required']) && $value === '') fail($field['label'].' is required');
        if ($value !== '' && $field['type'] === 'select' && !in_array($value, $field['options'], true)) fail('Invalid '.$field['label']);
        if ($value !== '' && $field['type'] === 'date') {
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$date || $date->format('Y-m-d') !== $value) fail('Invalid '.$field['label']);
        }
        $out[$name] = substr($value, 0, $field['type'] === 'textarea' ? 10000 : 1000);
    }
    return $out;
}
