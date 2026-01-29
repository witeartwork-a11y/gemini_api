# Миграция на PHP - Полное руководство

## 📋 Содержание

1. [Что изменилось](#что-изменилось)
2. [Билд приложения](#билд-приложения)
3. [Варианты развертывания](#варианты-развертывания)
4. [Тестирование](#тестирование)

## Что изменилось

### Было (Node.js Express)
- Server: `server.js` (Node.js + Express)
- API порт: 3001
- Фронтенд на Vite: порт 3000

### Стало (PHP + Apache/Nginx)
- API: `api/index.php` (PHP роутер)
- Фронтенд: React + Vite (собирается в статический HTML)
- Всё работает на одном сервере Apache/Nginx

## Билд приложения

### Шаг 1: Установка зависимостей
```bash
npm install
```

### Шаг 2: Сборка для продакшена
```bash
npm run build
```

Это создаст директорию `dist/` со следующей структурой:
```
dist/
├── index.html              # React приложение
├── .htaccess               # Маршрутизация для Apache
├── assets/                 # JS/CSS файлы
├── api/                    # PHP API
│   ├── index.php          # Главный API роутер
│   └── README.md
└── data/                   # Хранилище данных пользователей (создается автоматически)
```

## Варианты развертывания

### Вариант 1: Docker (Рекомендуется для быстрого старта)

```bash
# Сборка
npm run build

# Запуск
docker-compose up --build

# Приложение будет доступно на http://localhost
```

Для остановки:
```bash
docker-compose down
```

**Особенности:**
- ✅ Всё работает "из коробки"
- ✅ PHP 8.2 + Apache
- ✅ Автоматическое сжатие (gzip)
- ✅ Кэширование статических файлов

---

### Вариант 2: Apache на вашем сервере

**Требования:**
- Apache 2.4+
- PHP 7.4+ (рекомендуется 8.2+)
- mod_rewrite включен

**Установка:**

1. Скопируйте содержимое `dist/` в директорию Apache:
```bash
sudo cp -r dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/
sudo chmod -R 777 /var/www/html/data  # Для записи данных
```

2. Включите нужные модули:
```bash
sudo a2enmod rewrite headers deflate
sudo systemctl restart apache2
```

3. Файл `.htaccess` уже включен в билд, маршрутизация работает автоматически.

**Тестирование:**
```bash
curl http://localhost/api/history/testuser
```

---

### Вариант 3: Nginx на вашем сервере

**Требования:**
- Nginx 1.19+
- PHP-FPM 7.4+

**Установка:**

1. Скопируйте содержимое `dist/`:
```bash
sudo cp -r dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html/
chmod -R 777 /var/www/html/data
```

2. Используйте конфиг из `nginx.conf`:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/gemini-app
sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

3. Установите и запустите PHP-FPM:
```bash
sudo apt install php-fpm
sudo systemctl start php8.2-fpm
```

**Тестирование:**
```bash
curl http://localhost/api/history/testuser
```

---

### Вариант 4: Локальный PHP сервер (для разработки)

```bash
cd dist
php -S localhost:8080
```

Приложение будет доступно на `http://localhost:8080`

⚠️ **Внимание:** Этот вариант только для разработки, не используйте в продакшене!

---

## API Endpoints

Все API endpoints теперь доступны через один адрес:

### Сохранение результата
```
POST /api/save
Content-Type: application/json

{
  "userId": "user123",
  "type": "single",
  "model": "gemini-3-pro",
  "prompt": "Describe this image",
  "image": "data:image/png;base64,...",
  "text": "Result text",
  "aspectRatio": "16:9",
  "timestamp": 1704067200
}
```

### Получение истории
```
GET /api/history/user123
GET /api/history/user123?date=2024-01-01
```

### Удаление записи
```
DELETE /api/history/user123/item-id
```

### Получение/сохранение настроек
```
GET /api/settings/user123
POST /api/settings/user123
```

### Получение файла
```
GET /api/files/user123/images/2024-01-01/filename.png
```

## Тестирование

### Локально в контейнере
```bash
npm run build
docker-compose up

# В другом терминале
curl http://localhost/api/history/test-user
```

### На боевом сервере
```bash
# Проверка API
curl https://yourdomain.com/api/history/test-user

# Проверка сохранения файла
curl -X POST https://yourdomain.com/api/save \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "testuser",
    "type": "single",
    "model": "gemini-3-pro",
    "prompt": "test",
    "text": "result",
    "timestamp": '$(date +%s)'
  }'
```

## Struktura Данных

### Директория пользователя
```
data/
└── user123/
    ├── images/
    │   └── 2024-01-01/
    │       ├── 1704067200_abc1234.png
    │       └── 1704067201_def5678.png
    ├── logs/
    │   ├── 2024-01-01.json
    │   ├── 2024-01-02.json
    │   └── ...
    └── settings.json
```

### Формат logs JSON
```json
[
  {
    "id": "abc1234",
    "timestamp": 1704067200,
    "dateStr": "2024-01-01",
    "userId": "user123",
    "type": "single",
    "model": "gemini-3-pro",
    "prompt": "Describe this image",
    "imageRelativePath": "images/2024-01-01/1704067200_abc1234.png",
    "resultText": "A description of the image...",
    "aspectRatio": "16:9"
  }
]
```

## Решение проблем

### ❌ API возвращает 404

**На Apache:**
- Проверьте, включен ли mod_rewrite: `sudo a2enmod rewrite`
- Убедитесь, что `.htaccess` находится в dist/
- Перезагрузите Apache: `sudo systemctl restart apache2`

**На Nginx:**
- Проверьте конфиг: `sudo nginx -t`
- Убедитесь, что PHP-FPM запущен: `systemctl status php8.2-fpm`

### ❌ Изображения не загружаются

- Проверьте права доступа: `chmod 777 /var/www/html/data/*/images`
- Проверьте ошибки Apache: `sudo tail -f /var/log/apache2/error.log`
- Проверьте ошибки Nginx: `sudo tail -f /var/log/nginx/error.log`

### ❌ CORS ошибки

CORS включен для всех источников по умолчанию. Если нужно ограничить:

Отредактируйте `api/index.php`:
```php
header('Access-Control-Allow-Origin: https://yourdomain.com');
```

### ❌ Медленная загрузка файлов

Увеличьте лимит в конфиге:

**Apache (.htaccess):**
```apache
php_value upload_max_filesize 100M
php_value post_max_size 100M
```

**Nginx (nginx.conf):**
```nginx
client_max_body_size 100M;
```

**PHP (php.ini):**
```ini
upload_max_filesize = 100M
post_max_size = 100M
```

## Переменные окружения

Добавьте `.env.production` перед сборкой:
```bash
VITE_API_URL=https://yourdomain.com
GEMINI_API_KEY=your-api-key
```

Используется при сборке:
```bash
npm run build
```

## Миграция существующих данных

Если у вас уже есть данные на Node.js сервере:

```bash
# 1. Скопируйте директорию data
cp -r path/to/old/data/* dist/data/

# 2. Проверьте права доступа
chmod -R 777 dist/data

# 3. Развертните
npm run build && docker-compose up
```

## SSL/HTTPS

### Docker с certbot
```bash
# Добавьте в docker-compose.yml
  certbot:
    image: certbot/certbot
    volumes:
      - ./letsencrypt:/etc/letsencrypt
    command: certonly --standalone -d yourdomain.com
```

### Вручную на сервере
```bash
# Apache
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d yourdomain.com

# Nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Резервное копирование

```bash
# Резервная копия данных
tar -czf backup_$(date +%Y%m%d).tar.gz dist/data/

# Восстановление
tar -xzf backup_20240101.tar.gz -C dist/
```

## Производительность

Рекомендуемые параметры для продакшена:

```nginx
# Nginx
worker_processes auto;
worker_connections 2048;
keepalive_timeout 65;
```

```apache
# Apache
MaxRequestWorkers 256
MinSpareServers 10
MaxSpareServers 20
```

```php
# php.ini
memory_limit = 512M
max_execution_time = 300
```

## Поддержка

Если возникнут проблемы, проверьте:

1. Логи приложения
2. Логи вебсервера (Apache/Nginx)
3. Логи PHP (если отдельно)
4. Права доступа на файлы/директории

Удачи с развертыванием! 🚀
