<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Wite AI — Gemini Image Generator

Полнофункциональное веб-приложение для генерации изображений и текста через Google Gemini API / NeuroAPI.

**Архитектура:**
- 🎨 **Фронтенд:** React + TypeScript + Tailwind CSS (собирается в статический SPA через Vite)
- 🔙 **Бэкенд:** Node.js + Express 5 (REST API, сессии, шифрование)
- 💾 **Хранилище:** Файловая система (JSON логи + PNG изображения + миниатюры)
- 🔐 **Безопасность:** PBKDF2 хэширование паролей, AES-256 шифрование API ключей, rate limiting, CORS
- 🖼️ **Миниатюры:** Автоматическая генерация через sharp (300px)

## 🚀 Быстрый старт

### Локальная разработка

```bash
# Установка зависимостей
npm install

# Запуск (Node.js сервер + Vite dev server)
npm run dev

# Открыть http://localhost:3000 (фронтенд)
# API доступен на http://localhost:3001/api/
```

### Продакшен (сервер с Nginx)

```bash
# 1. Сборка фронтенда
npm run build

# 2. Создание архива для деплоя
# PowerShell:
Compress-Archive -Path dist, server, package.json, package-lock.json -DestinationPath deploy.zip -Force
# bash:
zip -r deploy.zip dist/ server/ package.json package-lock.json

# 3. На сервере:
unzip deploy.zip -d /var/www/site/
cd /var/www/site
npm install --production
pm2 start server/index.js --name gemini-api
```

Подробнее: [FAQ/Deploy Archive](FAQ/Deploy%20Archive)

## 📋 Требования

- **Node.js** 18+
- **npm** 8+
- **Nginx** (production, проксирует `/api/` в Node.js)
- **PM2** (production, менеджер процессов)

## 📁 Структура проекта

```
.
├── server/                 # Node.js бэкенд (Express 5)
│   ├── index.js           # Точка входа, middleware, маршруты
│   ├── middleware/
│   │   ├── auth.js        # Сессии, PBKDF2, Bearer-токены
│   │   └── rateLimit.js   # Rate limiting (200 req/min)
│   ├── routes/
│   │   ├── files.js       # Отдача изображений (CORS для внешней галереи)
│   │   ├── gallery.js     # Внешняя галерея API (/api/external_gallery)
│   │   ├── history.js     # CRUD истории генераций + thumbnails
│   │   ├── users.js       # Пользователи, логин, PBKDF2 миграция
│   │   ├── settings.js    # Системные настройки
│   │   ├── serverKeys.js  # API ключи провайдеров (AES-256)
│   │   ├── presets.js     # Пресеты генерации
│   │   ├── cloudJobs.js   # Cloud Batch задания
│   │   ├── userPreferences.js
│   │   └── userSettings.js
│   └── utils/
│       ├── encryption.js  # AES-256-CBC шифрование
│       ├── thumbnail.js   # Генерация миниатюр (sharp)
│       ├── validation.js  # Валидация входных данных
│       ├── logger.js      # Структурированное логирование
│       └── mergeJobs.js   # Слияние batch-заданий
├── views/                  # React страницы
│   ├── SingleGenerator.tsx # Генерация одного изображения
│   ├── BatchProcessor.tsx  # Пакетная генерация
│   ├── CloudBatchProcessor.tsx
│   ├── GalleryView.tsx    # Галерея с пагинацией
│   ├── AdminPanel.tsx     # Панель администратора
│   └── LoginView.tsx
├── services/               # Фронтенд-сервисы
│   ├── geminiService.ts   # Google Gemini API клиент
│   ├── neuroApiService.ts # NeuroAPI клиент
│   ├── authService.ts     # Аутентификация (Bearer token)
│   ├── historyService.ts  # История генераций
│   └── settingsService.ts # Настройки
├── components/             # React UI компоненты
├── contexts/               # React контексты (язык, тема)
├── hooks/                  # React хуки (пресеты)
├── dist/                   # Собранный фронтенд (после npm run build)
├── data/                   # Пользовательские данные (НЕ в git!)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🛠️ Команды

| Команда            | Описание                                     |
|--------------------|----------------------------------------------|
| `npm run dev`      | Запуск dev-сервера (Node.js + Vite)          |
| `npm run build`    | Сборка для продакшена                        |
| `npm run preview`  | Просмотр собранного приложения               |

## 🌐 API Endpoints

### Публичные
```
POST   /api/login                    # Аутентификация
GET    /api/system-settings          # Системные настройки (тема, язык)
GET    /api/files/:userId/*          # Файлы (изображения, миниатюры)
GET    /api/external_gallery?key=... # Внешняя галерея (по API ключу)
```

### Авторизованные (Bearer token)
```
POST   /api/save                     # Сохранить генерацию
GET    /api/history/:userId          # История пользователя
DELETE /api/history/:userId/:id      # Удалить запись

GET    /api/settings/:userId         # Настройки пользователя
POST   /api/settings/:userId         # Сохранить настройки

GET    /api/user-preferences/:userId # Предпочтения пользователя
POST   /api/user-preferences/:userId # Сохранить предпочтения

GET    /api/cloud-jobs/:userId       # Cloud Batch задания
POST   /api/cloud-jobs/:userId       # Сохранить задания

GET    /api/presets                   # Пресеты
POST   /api/presets                   # Создать пресет
DELETE /api/presets/:name             # Удалить пресет
```

### Только для администратора
```
GET    /api/users                    # Список пользователей
POST   /api/users                    # Создать/обновить пользователя
DELETE /api/users/:userId            # Удалить пользователя

GET    /api/key                      # API ключ внешней галереи
POST   /api/system-settings         # Обновить системные настройки

GET    /api/server-keys              # API ключи провайдеров
POST   /api/server-keys              # Добавить ключ
DELETE /api/server-keys/:id          # Удалить ключ
POST   /api/server-keys/:id/toggle   # Включить/выключить ключ

GET    /api/admin/stats              # Статистика использования
```

Документация внешней галереи: [FAQ/Gallery API](FAQ/Gallery%20API)

## 🔐 Безопасность

- **Пароли** — PBKDF2 (100K итераций, SHA-256) с автоматической миграцией с SHA-256
- **API ключи** — AES-256-CBC шифрование, ключ в `data/.encryption_key`
- **Сессии** — Bearer-токены, 24ч TTL, автоочистка
- **Rate limiting** — 200 req/min общий, 15 req/15min на логин
- **CORS** — отключён в production (same-origin), включён для внешней галереи
- **Валидация** — проверка userId, защита от path traversal
- **trust proxy** — корректный IP за Nginx

## ⚙️ Переменные окружения

| Переменная            | По умолчанию              | Описание                    |
|-----------------------|---------------------------|-----------------------------|
| `PORT`                | `3001`                    | Порт Node.js сервера        |
| `DATA_DIR`            | `./data`                  | Директория данных            |
| `NODE_ENV`            | —                         | `production` для продакшена  |
| `KEY_ENCRYPTION_SECRET` | авто из файла          | Ключ шифрования API ключей   |

## 📖 Документация

- [FAQ/Gallery API](FAQ/Gallery%20API) — Внешняя галерея: эндпоинты, примеры, troubleshooting
- [FAQ/Deploy Archive](FAQ/Deploy%20Archive) — Сборка и деплой: чеклист, структура архива, Nginx

## 📝 Лицензия

MIT
