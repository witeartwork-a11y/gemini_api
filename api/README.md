# PHP Backend Configuration

This directory contains the PHP API endpoints for the Gemini AI Application.

## Structure

- `index.php` - Main API router that handles all API endpoints

## API Endpoints

### File Management
- `GET /api/files/{userId}/{filePath}` - Retrieve a file (image, etc.)

### History
- `GET /api/history/{userId}` - Get all history items for a user
- `GET /api/history/{userId}?date=YYYY-MM-DD` - Get history for a specific date
- `DELETE /api/history/{userId}/{id}` - Delete a history item

### Generation
- `POST /api/save` - Save a generation result

Request body:
```json
{
  "userId": "string",
  "type": "single|batch|cloud",
  "model": "string",
  "prompt": "string",
  "image": "base64-string (optional)",
  "text": "string (optional)",
  "aspectRatio": "string",
  "timestamp": "number"
}
```

### Settings
- `GET /api/settings/{userId}` - Get user settings
- `POST /api/settings/{userId}` - Save user settings

## Requirements

- PHP 7.4+
- Apache with mod_rewrite enabled (or Nginx with proper configuration)

## Installation

### Apache Setup

1. Enable `mod_rewrite`:
```bash
sudo a2enmod rewrite
```

2. Enable `mod_headers`:
```bash
sudo a2enmod headers
```

3. Enable `mod_deflate`:
```bash
sudo a2enmod deflate
```

4. Configure VirtualHost:
```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    DocumentRoot /var/www/html/dist
    
    <Directory /var/www/html/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

5. Restart Apache:
```bash
sudo systemctl restart apache2
```

### Nginx Setup

Create `/etc/nginx/sites-available/gemini-app`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/html/dist;
    index index.html;
    
    client_max_body_size 50M;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
    
    # Static files caching
    location ~* \.(js|css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API routes
    location /api/ {
        try_files $uri /api/index.php?$query_string;
    }
    
    # React Router fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

6. Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/gemini-app /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## File Structure

After build, the dist folder should look like:
```
dist/
├── index.html          # React app entry point
├── .htaccess           # Apache routing config
├── assets/             # Built JS/CSS files
├── api/
│   └── index.php       # PHP API router
└── data/               # User data storage (auto-created)
    └── {userId}/
        ├── images/
        ├── logs/
        └── settings.json
```

## Data Storage

User data is stored in the `data` directory structure:
- Images: `data/{userId}/images/{date}/`
- Logs: `data/{userId}/logs/{date}.json`
- Settings: `data/{userId}/settings.json`

## CORS

CORS headers are enabled for all origins by default in the PHP API.
To restrict access, modify the header in `api/index.php`:

```php
header('Access-Control-Allow-Origin: https://yourdomain.com');
```

## Security Notes

1. Ensure proper file permissions on the `data` directory
2. Use HTTPS in production
3. Implement authentication if needed
4. Regular backups of the `data` directory

## Troubleshooting

### 404 errors on API calls
- Ensure mod_rewrite is enabled in Apache
- Check .htaccess file is present in the dist directory
- Verify file permissions

### Images not loading
- Check file permissions on images directory
- Verify imageUrl is constructed correctly

### CORS errors
- Ensure PHP headers are being sent
- Check browser console for specific error messages
