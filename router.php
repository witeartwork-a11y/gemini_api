<?php
// Router for PHP's built-in server
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/api#', $uri)) {
    $_SERVER['REQUEST_URI'] = $uri;
    require __DIR__ . '/api/index.php';
    return;
}
if (file_exists(__DIR__ . $uri) && is_file(__DIR__ . $uri)) {
    return false;
}
if (!preg_match('/\.[a-z0-9]+$/i', $uri)) {
    require __DIR__ . '/index.html';
    return;
}
http_response_code(404);
echo "Not found";
?>