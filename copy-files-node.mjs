#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📋 Копирование файлов API...');

// Ensure dist exists
const distDir = path.join(__dirname, 'dist');
const apiDir = path.join(distDir, 'api');
const dataDir = path.join(distDir, 'data');

// Create directories
if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
}

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Copy PHP API
const phpFile = path.join(__dirname, 'api', 'index.php');
const phpDest = path.join(apiDir, 'index.php');

if (fs.existsSync(phpFile)) {
    fs.copyFileSync(phpFile, phpDest);
    console.log('✓ PHP API скопирован');
} else {
    console.warn('⚠ api/index.php не найден');
}

// Copy .htaccess
const htaccess = path.join(__dirname, '.htaccess');
const htaccessDest = path.join(distDir, '.htaccess');

if (fs.existsSync(htaccess)) {
    fs.copyFileSync(htaccess, htaccessDest);
    console.log('✓ .htaccess скопирован');
} else {
    console.warn('⚠ .htaccess не найден');
}

// Copy router.php for local development
const routerPhp = path.join(__dirname, 'router.php');
if (!fs.existsSync(routerPhp)) {
    // Create router.php if it doesn't exist
    const routerContent = `<?php
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
if (!preg_match('/\\.[a-z0-9]+$/i', $uri)) {
    require __DIR__ . '/index.html';
    return;
}
http_response_code(404);
echo "Not found";
?>`;
    fs.writeFileSync(routerPhp, routerContent);
}
const routerDest = path.join(distDir, 'router.php');
fs.copyFileSync(routerPhp, routerDest);
console.log('✓ Router скопирован');

// Copy README
const apiReadme = path.join(__dirname, 'api', 'README.md');
const apiReadmeDest = path.join(apiDir, 'README.md');

if (fs.existsSync(apiReadme)) {
    fs.copyFileSync(apiReadme, apiReadmeDest);
    console.log('✓ API README скопирован');
}

console.log('✅ Все файлы скопированы!');
console.log('');
console.log('📁 Структура dist/:');
console.log('   dist/');
console.log('   ├── index.html');
console.log('   ├── .htaccess');
console.log('   ├── router.php');
console.log('   ├── assets/');
console.log('   ├── api/');
console.log('   │   ├── index.php');
console.log('   │   └── README.md');
console.log('   └── data/          (создается при первом запросе)');


