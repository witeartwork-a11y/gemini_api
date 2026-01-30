<?php
// API Router for PHP Backend

// Disable output buffering to prevent any unwanted output
ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Define base path for data storage
define('DATA_DIR', __DIR__ . '/../data');

// Определяем протокол (HTTP или HTTPS) автоматически
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? 'https://' : 'http://';
define('PORT', $protocol . $_SERVER['HTTP_HOST']);

// Ensure data directory exists
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// Parse URL - handle both Apache and plain PHP server
$request_uri = $_SERVER['REQUEST_URI'];
$script_name = $_SERVER['SCRIPT_NAME'];

// Extract the API path
if (strpos($request_uri, '/api/') !== false) {
    // Find /api/ in the URL
    $api_pos = strpos($request_uri, '/api/');
    $path = substr($request_uri, $api_pos);
} else {
    $path = str_replace(dirname($script_name), '', $request_uri);
    $path = '/' . ltrim($path, '/');
}

// Remove query string
$path = strtok($path, '?');

$method = $_SERVER['REQUEST_METHOD'];

// Route matching
$matches = [];

// Route: GET /api/files/{userId}/{rest_of_path}
if ($method === 'GET' && preg_match('#^/api/files/([^/]+)/(.*)$#', $path, $matches)) {
    serveFile($matches[1], $matches[2]);
}
// Route: POST /api/save
elseif ($method === 'POST' && $path === '/api/save') {
    saveGeneration();
}
// Route: GET /api/history/{userId}
elseif ($method === 'GET' && preg_match('#^/api/history/([^/]+)$#', $path, $matches)) {
    getHistory($matches[1]);
}
// Route: DELETE /api/history/{userId}/{id}
elseif ($method === 'DELETE' && preg_match('#^/api/history/([^/]+)/([^/]+)$#', $path, $matches)) {
    deleteHistoryItem($matches[1], $matches[2]);
}
// Route: GET /api/settings/{userId}
elseif ($method === 'GET' && preg_match('#^/api/settings/([^/]+)$#', $path, $matches)) {
    getSettings($matches[1]);
}
// Route: POST /api/settings/{userId}
elseif ($method === 'POST' && preg_match('#^/api/settings/([^/]+)$#', $path, $matches)) {
    saveSettings($matches[1]);
}
// Route: GET /api/key
elseif ($method === 'GET' && $path === '/api/key') {
    getOrGenerateApiKey();
}
// Route: GET /api/external_gallery
elseif ($method === 'GET' && $path === '/api/external_gallery') {
    handleExternalGallery();
}
else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}

// ============= FUNCTIONS =============

function serveFile($userId, $relativePath) {
    // Prevent directory traversal
    $safePath = str_replace('..', '', $relativePath);
    $safePath = preg_replace('#[^a-zA-Z0-9/_.\-]#', '', $safePath);
    
    $filePath = DATA_DIR . '/' . $userId . '/' . $safePath;
    
    if (file_exists($filePath) && is_file($filePath)) {
        $mimeType = getMimeType($filePath);
        header("Content-Type: " . $mimeType);
        readfile($filePath);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
    }
}

function getMimeType($filePath) {
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $mimeTypes = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'txt' => 'text/plain',
        'csv' => 'text/csv',
        'json' => 'application/json',
    ];
    return $mimeTypes[$ext] ?? 'application/octet-stream';
}

function getJsonInput() {
    $input = file_get_contents('php://input');
    return json_decode($input, true);
}

function saveGeneration() {
    $data = getJsonInput();
    
    if (!isset($data['userId']) || empty($data['userId'])) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID required']);
        return;
    }
    
    try {
        $userId = $data['userId'];
        $type = $data['type'] ?? 'single';
        $model = $data['model'] ?? '';
        $prompt = $data['prompt'] ?? '';
        $image = $data['image'] ?? null;
        $text = $data['text'] ?? null;
        $aspectRatio = $data['aspectRatio'] ?? 'Auto';
        $timestamp = $data['timestamp'] ?? time();
        
        $dateStr = date('Y-m-d');
        $userDir = DATA_DIR . '/' . $userId;
        
        // Create directories
        $imagesDir = $userDir . '/images/' . $dateStr;
        $logsDir = $userDir . '/logs';
        
        if (!is_dir($imagesDir)) {
            mkdir($imagesDir, 0755, true);
        }
        if (!is_dir($logsDir)) {
            mkdir($logsDir, 0755, true);
        }
        
        $id = substr(uniqid(), -7);
        $baseFilename = $timestamp . '_' . $id;
        
        $imageFilename = null;
        
        // Save image if provided
        if ($image) {
            // Remove data:image/...;base64, prefix
            $base64Data = preg_replace('#^data:image/\w+;base64,#', '', $image);
            $imageData = base64_decode($base64Data);
            
            $imageFilename = $baseFilename . '.png';
            $imagePath = $imagesDir . '/' . $imageFilename;
            file_put_contents($imagePath, $imageData);

            // --- Thumbnail Generation ---
            try {
                $thumbnailsDir = $userDir . '/thumbnails/' . $dateStr;
                if (!is_dir($thumbnailsDir)) {
                    mkdir($thumbnailsDir, 0755, true);
                }
                $thumbPath = $thumbnailsDir . '/' . $imageFilename;
                
                // Create thumbnail
                $src = imagecreatefromstring($imageData);
                if ($src) {
                    $width = imagesx($src);
                    $height = imagesy($src);
                    $newWidth = 300; // Thumbnail width
                    $newHeight = floor($height * ($newWidth / $width));
                    
                    $tmp = imagescale($src, $newWidth, $newHeight);
                    if ($tmp) {
                        imagepng($tmp, $thumbPath, 8);
                        imagedestroy($tmp);
                    }
                    imagedestroy($src);
                }
            } catch (Exception $e) {
                // Ignore thumbnail errors, main image is saved
            }
            // -----------------------------
        }
        
        // Update daily log
        $logFilePath = $logsDir . '/' . $dateStr . '.json';
        
        $metaEntry = [
            'id' => $id,
            'timestamp' => $timestamp,
            'dateStr' => $dateStr,
            'userId' => $userId,
            'type' => $type,
            'model' => $model,
            'prompt' => $prompt,
            'imageRelativePath' => $imageFilename ? 'images/' . $dateStr . '/' . $imageFilename : null,
            'thumbnailRelativePath' => $imageFilename ? 'thumbnails/' . $dateStr . '/' . $imageFilename : null,
            'resultText' => $text,
            'aspectRatio' => $aspectRatio
        ];
        
        $dailyLog = [];
        if (file_exists($logFilePath)) {
            $logContent = file_get_contents($logFilePath);
            $dailyLog = json_decode($logContent, true) ?? [];
        }
        
        $dailyLog[] = $metaEntry;
        file_put_contents($logFilePath, json_encode($dailyLog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        
        echo json_encode(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function getHistory($userId) {
    try {
        $userDir = DATA_DIR . '/' . $userId;
        $logsDir = $userDir . '/logs';
        
        if (!is_dir($logsDir)) {
            echo json_encode([]);
            return;
        }
        
        $date = $_GET['date'] ?? null;
        $historyItems = [];
        
        if ($date) {
            $specificLog = $logsDir . '/' . $date . '.json';
            if (file_exists($specificLog)) {
                $entries = json_decode(file_get_contents($specificLog), true) ?? [];
                // FIXED: Add imageUrl for filtered date results
                foreach ($entries as &$entry) {
                    if (isset($entry['imageRelativePath']) && $entry['imageRelativePath']) {
                        // Ensure thumbnail exists
                        $thumbRel = ensureThumbnail($userId, $entry['imageRelativePath']);
                        if ($thumbRel) {
                            $entry['thumbnailRelativePath'] = $thumbRel;
                            $entry['thumbnailUrl'] = PORT . '/api/files/' . $userId . '/' . $thumbRel;
                        }
                        $entry['imageUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['imageRelativePath'];
                    }
                    if (isset($entry['thumbnailRelativePath']) && $entry['thumbnailRelativePath']) {
                         if (!isset($entry['thumbnailUrl'])) {
                            $entry['thumbnailUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['thumbnailRelativePath'];
                         }
                    }
                }
                $historyItems = $entries;
            }
        } else {
            // Read all logs
            $files = array_filter(scandir($logsDir), function($f) {
                return substr($f, -5) === '.json';
            });
            
            foreach ($files as $file) {
                $entries = json_decode(file_get_contents($logsDir . '/' . $file), true) ?? [];
                if (is_array($entries)) {
                    foreach ($entries as $entry) {
                        if (isset($entry['imageRelativePath']) && $entry['imageRelativePath']) {
                            // Ensure thumbnail exists
                            $thumbRel = ensureThumbnail($userId, $entry['imageRelativePath']);
                            if ($thumbRel) {
                                $entry['thumbnailRelativePath'] = $thumbRel;
                                $entry['thumbnailUrl'] = PORT . '/api/files/' . $userId . '/' . $thumbRel;
                            }
                            $entry['imageUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['imageRelativePath'];
                        }
                        if (isset($entry['thumbnailRelativePath']) && $entry['thumbnailRelativePath']) {
                             // Double check it wasn't just added above
                             if (!isset($entry['thumbnailUrl'])) {
                                $entry['thumbnailUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['thumbnailRelativePath'];
                             }
                        }
                        $historyItems[] = $entry;
                    }
                }
            }
        }
        
        // Sort by timestamp desc
        usort($historyItems, function($a, $b) {
            return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0);
        });
        
        echo json_encode($historyItems);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function ensureThumbnail($userId, $imageRelativePath) {
    global $protocol;
    $userDir = DATA_DIR . '/' . $userId;
    $fullImagePath = $userDir . '/' . $imageRelativePath;
    
    // Check if main image exists
    if (!file_exists($fullImagePath)) {
        return null;
    }

    // Derive thumbnail path
    // imageRelativePath: images/2026-01-29/filename.png
    // We want: thumbnails/2026-01-29/filename.png
    $parts = explode('/', $imageRelativePath);
    if (count($parts) < 3) return null; // Unexpected structure
    
    // Switch 'images' dir to 'thumbnails' dir
    if ($parts[0] === 'images') {
        $parts[0] = 'thumbnails';
    } else {
        // Fallback or other structure?
        return null;
    }
    
    $thumbRelativePath = implode('/', $parts);
    $fullThumbPath = $userDir . '/' . $thumbRelativePath;
    
    // If thumbnail already exists, return path
    if (file_exists($fullThumbPath)) {
        return $thumbRelativePath;
    }
    
    // Start Generation
    try {
        // Create directory if needed
        $thumbDir = dirname($fullThumbPath);
        if (!is_dir($thumbDir)) {
            mkdir($thumbDir, 0755, true);
        }
        
        $imageData = file_get_contents($fullImagePath);
        if (!$imageData) return null;
        
        $src = imagecreatefromstring($imageData);
        if ($src) {
            $width = imagesx($src);
            $height = imagesy($src);
            $newWidth = 300; // Thumbnail width
            $newHeight = floor($height * ($newWidth / $width));
            
            $tmp = imagescale($src, $newWidth, $newHeight);
            if ($tmp) {
                imagepng($tmp, $fullThumbPath, 8);
                imagedestroy($tmp);
                imagedestroy($src);
                return $thumbRelativePath;
            }
            imagedestroy($src);
        }
    } catch (Exception $e) {
        return null;
    }
    return null;
}

function deleteHistoryItem($userId, $id) {
    try {
        $userDir = DATA_DIR . '/' . $userId;
        $logsDir = $userDir . '/logs';
        
        if (!is_dir($logsDir)) {
            http_response_code(404);
            echo json_encode(['error' => 'Item not found']);
            return;
        }
        
        $files = array_filter(scandir($logsDir), function($f) {
            return substr($f, -5) === '.json';
        });
        
        $found = false;
        
        foreach ($files as $file) {
            $logFile = $logsDir . '/' . $file;
            $entries = json_decode(file_get_contents($logFile), true) ?? [];
            
            $index = -1;
            foreach ($entries as $i => $entry) {
                if ($entry['id'] === $id) {
                    $index = $i;
                    break;
                }
            }
            
            if ($index !== -1) {
                $item = $entries[$index];
                
                // Delete image file if exists
                if (isset($item['imageRelativePath']) && $item['imageRelativePath']) {
                    $imgPath = $userDir . '/' . $item['imageRelativePath'];
                    if (file_exists($imgPath)) {
                        unlink($imgPath);
                    }
                }

                // Delete thumbnail file if exists
                if (isset($item['thumbnailRelativePath']) && $item['thumbnailRelativePath']) {
                    $thumbPath = $userDir . '/' . $item['thumbnailRelativePath'];
                    if (file_exists($thumbPath)) {
                        unlink($thumbPath);
                    }
                } elseif (isset($item['imageRelativePath'])) {
                     // Try to infer thumbnail path even if not in JSON (legacy support)
                     $parts = explode('/', $item['imageRelativePath']);
                     if (count($parts) >= 2 && $parts[0] === 'images') {
                         $parts[0] = 'thumbnails';
                         $inferredThumbPath = $userDir . '/' . implode('/', $parts);
                         if (file_exists($inferredThumbPath)) {
                             unlink($inferredThumbPath);
                         }
                     }
                }
                
                // Remove from JSON
                unset($entries[$index]);
                $entries = array_values($entries); // Reindex
                file_put_contents($logFile, json_encode($entries, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                $found = true;
                break;
            }
        }
        
        if ($found) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Item not found']);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function getSettings($userId) {
    try {
        $userDir = DATA_DIR . '/' . $userId;
        $settingsFile = $userDir . '/settings.json';
        
        if (file_exists($settingsFile)) {
            $settings = json_decode(file_get_contents($settingsFile), true) ?? [];
            echo json_encode($settings);
        } else {
            echo json_encode([]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function saveSettings($userId) {
    try {
        $data = getJsonInput();
        $userDir = DATA_DIR . '/' . $userId;
        
        if (!is_dir($userDir)) {
            mkdir($userDir, 0755, true);
        }
        
        $settingsFile = $userDir . '/settings.json';
        file_put_contents($settingsFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function getOrGenerateApiKey() {
    $keyFile = DATA_DIR . '/global_api_key.txt';
    if (file_exists($keyFile)) {
        $key = trim(file_get_contents($keyFile));
    } else {
        $key = bin2hex(random_bytes(16));
        file_put_contents($keyFile, $key);
    }
    echo json_encode(['apiKey' => $key]);
}

function handleExternalGallery() {
    $key = $_GET['key'] ?? '';
    $keyFile = DATA_DIR . '/global_api_key.txt';
    
    if (!file_exists($keyFile) || trim(file_get_contents($keyFile)) !== $key) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid API Key']);
        return;
    }

    $allItems = [];
    $users = array_filter(scandir(DATA_DIR), function($u) {
        return $u !== '.' && $u !== '..' && is_dir(DATA_DIR . '/' . $u);
    });

    foreach ($users as $userId) {
        $logsDir = DATA_DIR . '/' . $userId . '/logs';
        if (!is_dir($logsDir)) continue;

        $files = array_filter(scandir($logsDir), function($f) {
            return substr($f, -5) === '.json';
        });

        foreach ($files as $file) {
            $entries = json_decode(file_get_contents($logsDir . '/' . $file), true) ?? [];
            if (is_array($entries)) {
                foreach ($entries as $entry) {
                    if (isset($entry['imageRelativePath']) && $entry['imageRelativePath']) {
                        $entry['imageUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['imageRelativePath'];
                    }
                    if (isset($entry['thumbnailRelativePath']) && $entry['thumbnailRelativePath']) {
                        $entry['thumbnailUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['thumbnailRelativePath'];
                    }
                    $allItems[] = $entry;
                }
            }
        }
    }
    
    usort($allItems, function($a, $b) {
        return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0);
    });

    echo json_encode($allItems);
}
?>
