<?php
// Optional cron: run php /absolute/path/to/hub/rollover.php at midnight daily.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$_GET['action'] = 'bootstrap';
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__.'/api.php';
