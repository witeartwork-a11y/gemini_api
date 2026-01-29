<?php
// API Router for PHP Backend
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
define('PORT', 'http://' . $_SERVER['HTTP_HOST']);

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
                            $entry['imageUrl'] = PORT . '/api/files/' . $userId . '/' . $entry['imageRelativePath'];
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
?>
