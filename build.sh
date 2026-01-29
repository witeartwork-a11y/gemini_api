#!/bin/bash

# Build and Deploy Script for Gemini AI App
# Автоматическое построение и развертывание приложения

set -e  # Exit on error

echo "🚀 Gemini AI App - Build & Deploy"
echo "=================================="
echo ""

# Step 1: Check Node.js
echo "✓ Проверка зависимостей..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js 16+ для продолжения."
    exit 1
fi

# Step 2: Install dependencies
echo "📦 Установка зависимостей..."
npm install

# Step 3: Build
echo "🔨 Сборка приложения..."
npm run build

echo ""
echo "✅ Сборка завершена!"
echo ""
echo "📁 Путь для развертывания: ./dist"
echo ""
echo "Варианты развертывания:"
echo "═══════════════════════════════════"
echo ""
echo "1️⃣  Docker (рекомендуется):"
echo "    docker-compose up --build"
echo ""
echo "2️⃣  Apache (требуется Apache 2.4+):"
echo "    sudo cp -r dist/* /var/www/html/"
echo "    sudo chown -R www-data:www-data /var/www/html/"
echo "    sudo chmod -R 777 /var/www/html/data"
echo ""
echo "3️⃣  Nginx (требуется Nginx + PHP-FPM):"
echo "    sudo cp -r dist/* /var/www/html/"
echo "    sudo cp nginx.conf /etc/nginx/sites-available/gemini-app"
echo "    sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/"
echo "    sudo systemctl restart nginx"
echo ""
echo "4️⃣  Локально (для тестирования):"
echo "    cd dist && php -S localhost:8080"
echo ""
echo "📚 Подробные инструкции в DEPLOYMENT.md"
echo ""
