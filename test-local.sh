#!/bin/bash

# Test script for local development
echo "🧪 Тестирование локальной установки"
echo "===================================="
echo ""

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "❌ Папка dist не найдена. Запустите 'npm run build' перед тестированием."
    exit 1
fi

echo "✓ Папка dist найдена"
echo ""

# Check PHP
if ! command -v php &> /dev/null; then
    echo "❌ PHP не установлен"
    exit 1
fi

PHP_VERSION=$(php -r 'echo phpversion();')
echo "✓ PHP найден: v$PHP_VERSION"
echo ""

# Test 1: Check if API is accessible
echo "🧪 Тест 1: Проверка API роутера..."
cd dist

# Start PHP server in background
php -S localhost:8888 &
PHP_PID=$!
sleep 2

# Test the API
RESPONSE=$(curl -s http://localhost:8888/api/history/test-user)

if [[ $RESPONSE == *"[]"* ]] || [[ $RESPONSE == *"error"* ]]; then
    echo "✓ API доступен"
else
    echo "❌ API не работает"
fi

echo "Ответ: $RESPONSE"
echo ""

# Test 2: Check file serving
echo "🧪 Тест 2: Проверка статических файлов..."
INDEX_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/index.html)

if [ "$INDEX_RESPONSE" = "200" ]; then
    echo "✓ Статические файлы доступны"
else
    echo "❌ Ошибка при загрузке статических файлов (HTTP $INDEX_RESPONSE)"
fi

echo ""

# Test 3: Check .htaccess routing
echo "🧪 Тест 3: Проверка маршрутизации..."
HISTORY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:8888/api/history/test-user)
HTTP_CODE=$(echo "$HISTORY_RESPONSE" | grep "HTTP_CODE" | cut -d':' -f2)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Маршрутизация работает"
else
    echo "⚠ Маршрутизация может требовать настройки Apache (.htaccess)"
fi

echo ""

# Cleanup
kill $PHP_PID 2>/dev/null
cd ..

echo "════════════════════════════════════"
echo "✅ Тестирование завершено!"
echo ""
echo "Для локального развертывания:"
echo "  cd dist"
echo "  php -S localhost:8080"
echo ""
echo "Затем откройте http://localhost:8080 в браузере"
