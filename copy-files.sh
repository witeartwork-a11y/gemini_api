#!/bin/bash

# Copy API files to dist after Vite build
echo "📋 Копирование файлов API..."

# Create api directory in dist
mkdir -p dist/api

# Copy PHP API
cp api/index.php dist/api/

# Copy .htaccess
cp .htaccess dist/

# Create data directory
mkdir -p dist/data

# Set permissions
chmod -R 755 dist/api
chmod -R 777 dist/data

echo "✅ Файлы скопированы!"
