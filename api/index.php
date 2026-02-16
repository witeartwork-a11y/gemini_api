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
// Route: GET /api/cloud-jobs/{userId}
elseif ($method === 'GET' && preg_match('#^/api/cloud-jobs/([^/]+)$#', $path, $matches)) {
    getCloudJobs($matches[1]);
}
// Route: POST /api/cloud-jobs/{userId}
elseif ($method === 'POST' && preg_match('#^/api/cloud-jobs/([^/]+)$#', $path, $matches)) {
    saveCloudJobs($matches[1]);
}
// Route: GET /api/key
elseif ($method === 'GET' && $path === '/api/key') {
    getOrGenerateApiKey();
}
// Route: GET /api/external_gallery
elseif ($method === 'GET' && $path === '/api/external_gallery') {
    handleExternalGallery();
}
// Route: GET /api/system-settings
elseif ($method === 'GET' && $path === '/api/system-settings') {
    getSystemSettings();
}
// Route: POST /api/system-settings
elseif ($method === 'POST' && $path === '/api/system-settings') {
    saveSystemSettingsAPI();
}
// Route: GET /api/presets - Get all presets (public)
elseif ($method === 'GET' && $path === '/api/presets') {
    getPresets();
}
// Route: POST /api/presets - Create/Update preset (admin only)
elseif ($method === 'POST' && $path === '/api/presets') {
    savePreset();
}
// Route: DELETE /api/presets - Delete preset (admin only)
elseif ($method === 'DELETE' && $path === '/api/presets') {
    // Check for name in query string first (preferred)
    $name = $_GET['name'] ?? null;
    if ($name) {
        deletePreset($name);
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Preset name required']);
    }
}
// Route: DELETE /api/presets/{name} - Delete preset (admin only) [Legacy/Path fallback]
elseif ($method === 'DELETE' && preg_match('#^/api/presets/(.+)$#', $path, $matches)) {
    deletePreset(urldecode($matches[1]));
}
// Route: GET /api/users - Get all users
elseif ($method === 'GET' && $path === '/api/users') {
    getUsers();
}
// Route: POST /api/users - Save user
elseif ($method === 'POST' && $path === '/api/users') {
    saveUser();
}
// Route: DELETE /api/users/{userId} - Delete user
elseif ($method === 'DELETE' && preg_match('#^/api/users/([^/]+)$#', $path, $matches)) {
    deleteUser($matches[1]);
}
// Route: GET /api/user-preferences/{userId} - Get user preferences
elseif ($method === 'GET' && preg_match('#^/api/user-preferences/([^/]+)$#', $path, $matches)) {
    getUserPreferences($matches[1]);
}
// Route: POST /api/user-preferences/{userId} - Save user preferences
elseif ($method === 'POST' && preg_match('#^/api/user-preferences/([^/]+)$#', $path, $matches)) {
    saveUserPreferences($matches[1]);
}
// Route: POST /api/login - Authenticate user
elseif ($method === 'POST' && $path === '/api/login') {
    loginUser();
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
        $usageMetadata = $data['usageMetadata'] ?? null;
        $estimatedCost = $data['estimatedCost'] ?? null;
        $inputImageInfo = $data['inputImageInfo'] ?? null;
        $outputResolution = $data['outputResolution'] ?? null;
        
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
            'aspectRatio' => $aspectRatio,
            'usageMetadata' => $usageMetadata,
            'estimatedCost' => $estimatedCost,
            'inputImageInfo' => $inputImageInfo,
            'outputResolution' => $outputResolution
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

function getCloudJobs($userId) {
    try {
        $userDir = DATA_DIR . '/' . $userId;
        $jobsFile = $userDir . '/cloud_jobs.json';

        if (file_exists($jobsFile)) {
            $jobs = json_decode(file_get_contents($jobsFile), true) ?? [];
            echo json_encode($jobs);
        } else {
            echo json_encode([]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function getJobVersion($job) {
    $raw = $job['updatedAt'] ?? ($job['timestamp'] ?? 0);
    return is_numeric($raw) ? intval($raw) : 0;
}

function normalizeJobStatus($status) {
    $normalized = strtoupper(strval($status ?? ''));
    if (str_starts_with($normalized, 'JOB_STATE_')) {
        return substr($normalized, 10);
    }
    return $normalized;
}

function getJobStatusRank($status) {
    $normalized = normalizeJobStatus($status);
    $rankMap = [
        'STATE_UNSPECIFIED' => 0,
        'UNSPECIFIED' => 0,
        'PENDING' => 1,
        'RUNNING' => 2,
        'SUCCEEDED' => 4,
        'FAILED' => 4,
        'CANCELLED' => 4,
    ];
    return $rankMap[$normalized] ?? 0;
}

function mergeCloudJobsList($existingJobs, $incomingJobs) {
    $mergedById = [];

    foreach ($existingJobs as $job) {
        if (!is_array($job) || empty($job['id'])) continue;
        $mergedById[$job['id']] = $job;
    }

    foreach ($incomingJobs as $incoming) {
        if (!is_array($incoming) || empty($incoming['id'])) continue;

        $id = $incoming['id'];
        $existing = $mergedById[$id] ?? null;

        if (!$existing) {
            $mergedById[$id] = $incoming;
            continue;
        }

        $existingVersion = getJobVersion($existing);
        $incomingVersion = getJobVersion($incoming);

        if ($incomingVersion > $existingVersion) {
            $mergedById[$id] = array_merge($existing, $incoming);
            continue;
        }

        if ($incomingVersion < $existingVersion) {
            continue;
        }

        $mergedJob = array_merge($existing, $incoming);

        if (getJobStatusRank($existing['status'] ?? '') > getJobStatusRank($incoming['status'] ?? '')) {
            $mergedJob['status'] = $existing['status'] ?? ($incoming['status'] ?? '');
        }

        if (empty($mergedJob['outputFileUri'])) {
            $mergedJob['outputFileUri'] = $existing['outputFileUri'] ?? ($incoming['outputFileUri'] ?? null);
        }

        $mergedById[$id] = $mergedJob;
    }

    $result = array_values($mergedById);
    usort($result, function ($a, $b) {
        $aTs = intval($a['timestamp'] ?? 0);
        $bTs = intval($b['timestamp'] ?? 0);
        return $bTs <=> $aTs;
    });

    return $result;
}

function saveCloudJobs($userId) {
    try {
        $data = getJsonInput();
        $userDir = DATA_DIR . '/' . $userId;

        if (!is_dir($userDir)) {
            mkdir($userDir, 0755, true);
        }

        $jobsFile = $userDir . '/cloud_jobs.json';
        $incoming = is_array($data) ? $data : [];

        $existing = [];
        if (file_exists($jobsFile)) {
            $loaded = json_decode(file_get_contents($jobsFile), true);
            $existing = is_array($loaded) ? $loaded : [];
        }

        $merged = mergeCloudJobsList($existing, $incoming);
        file_put_contents($jobsFile, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

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

    $hiddenUsers = [];
    $settingsFile = DATA_DIR . '/system_settings.json';
    if (file_exists($settingsFile)) {
        $settings = json_decode(file_get_contents($settingsFile), true) ?? [];
        if (isset($settings['externalGalleryHiddenUsers']) && is_array($settings['externalGalleryHiddenUsers'])) {
            $hiddenUsers = $settings['externalGalleryHiddenUsers'];
        }
    }

    $allItems = [];
    $users = array_filter(scandir(DATA_DIR), function($u) {
        return $u !== '.' && $u !== '..' && is_dir(DATA_DIR . '/' . $u);
    });

    foreach ($users as $userId) {
        if (in_array($userId, $hiddenUsers, true)) {
            continue;
        }

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

function getSystemSettings() {
    $settingsFile = DATA_DIR . '/system_settings.json';
    if (file_exists($settingsFile)) {
        $settings = json_decode(file_get_contents($settingsFile), true);
        echo json_encode($settings);
    } else {
        // Return default settings
        $defaults = [
            'showCreativity' => true,
            'showRepeats' => true,
            'theme' => 'default',
            'language' => 'en',
            'newYearMode' => false,
            'safetySettings' => [],
            'mediaResolution' => 'HIGH',
            'externalGalleryHiddenUsers' => []
        ];
        echo json_encode($defaults);
    }
}

function saveSystemSettingsAPI() {
    $data = getJsonInput();
    
    try {
        $settingsFile = DATA_DIR . '/system_settings.json';
        
        // Load existing settings and merge with new data
        $existingSettings = [];
        if (file_exists($settingsFile)) {
            $existingSettings = json_decode(file_get_contents($settingsFile), true) ?? [];
        }
        
        // Merge new data with existing settings
        $merged = array_merge($existingSettings, $data);
        
        file_put_contents($settingsFile, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============= PRESETS FUNCTIONS =============

function getPresets() {
    $presetsFile = DATA_DIR . '/presets.json';
    
    if (file_exists($presetsFile)) {
        $presets = json_decode(file_get_contents($presetsFile), true);
        echo json_encode($presets ?? []);
    } else {
        // Return empty presets on first load
        $defaults = [];
        
        // Save defaults to file
        file_put_contents($presetsFile, json_encode($defaults, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode($defaults);
    }
}

function savePreset() {
    $data = getJsonInput();
    
    // Validate required fields
    if (!isset($data['name']) || !isset($data['content'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Name and content are required']);
        return;
    }
    
    // Check if user is admin
    if (!isset($data['userId'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        return;
    }
    
    $usersFile = DATA_DIR . '/users.json';
    if (!file_exists($usersFile)) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        return;
    }
    
    $users = json_decode(file_get_contents($usersFile), true);
    $isAdmin = false;
    foreach ($users as $user) {
        if ($user['id'] === $data['userId'] && isset($user['isAdmin']) && $user['isAdmin']) {
            $isAdmin = true;
            break;
        }
    }
    
    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        return;
    }
    
    // Load existing presets
    $presetsFile = DATA_DIR . '/presets.json';
    $presets = [];
    if (file_exists($presetsFile)) {
        $presets = json_decode(file_get_contents($presetsFile), true) ?? [];
    }
    
    // Find and update or add new preset
    $found = false;
    foreach ($presets as &$preset) {
        if ($preset['name'] === $data['name']) {
            $preset['content'] = $data['content'];
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        $presets[] = [
            'name' => $data['name'],
            'content' => $data['content']
        ];
    }
    
    // Save to file
    file_put_contents($presetsFile, json_encode($presets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'presets' => $presets]);
}

function deletePreset($presetName) {
    $data = getJsonInput();
    
    // Check if user is admin
    // Fallback to GET param if body is empty (Server might strip DELETE body)
    $userId = $data['userId'] ?? $_GET['userId'] ?? null;

    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        return;
    }
    
    $usersFile = DATA_DIR . '/users.json';
    if (!file_exists($usersFile)) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        return;
    }
    
    $users = json_decode(file_get_contents($usersFile), true);
    $isAdmin = false;
    foreach ($users as $user) {
        if ($user['id'] === $userId && isset($user['isAdmin']) && $user['isAdmin']) {
            $isAdmin = true;
            break;
        }
    }
    
    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        return;
    }
    
    // Load presets
    $presetsFile = DATA_DIR . '/presets.json';
    if (!file_exists($presetsFile)) {
        http_response_code(404);
        echo json_encode(['error' => 'Presets file not found']);
        return;
    }
    
    $presets = json_decode(file_get_contents($presetsFile), true) ?? [];
    
    // Filter out the preset to delete
    $presets = array_values(array_filter($presets, function($preset) use ($presetName) {
        return $preset['name'] !== $presetName;
    }));
    
    // Save updated presets
    file_put_contents($presetsFile, json_encode($presets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'presets' => $presets]);
}

// ============= USER MANAGEMENT FUNCTIONS =============

function getUsers() {
    $usersFile = DATA_DIR . '/users.json';
    if (file_exists($usersFile)) {
        $users = json_decode(file_get_contents($usersFile), true) ?? [];
        // Don't send passwords to client
        foreach ($users as &$user) {
            unset($user['password']);
        }
        echo json_encode($users);
    } else {
        echo json_encode([]);
    }
}

function saveUser() {
    $data = getJsonInput();
    
    if (!isset($data['id']) || !isset($data['username'])) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID and username required']);
        return;
    }
    
    $usersFile = DATA_DIR . '/users.json';
    $users = [];
    if (file_exists($usersFile)) {
        $users = json_decode(file_get_contents($usersFile), true) ?? [];
    }
    
    // Find and update or add new user
    $found = false;
    foreach ($users as &$user) {
        if ($user['id'] === $data['id']) {
            // Update existing user
            $user['username'] = $data['username'];
            if (isset($data['password'])) {
                $user['password'] = $data['password'];
            }
            if (isset($data['role'])) {
                $user['role'] = $data['role'];
                $user['isAdmin'] = ($data['role'] === 'admin');
            }
            if (isset($data['allowedModels'])) {
                $user['allowedModels'] = $data['allowedModels'];
            }
            if (isset($data['preferences'])) {
                $user['preferences'] = $data['preferences'];
            }
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        // Add new user
        $newUser = [
            'id' => $data['id'],
            'username' => $data['username'],
            'password' => $data['password'] ?? '',
            'role' => $data['role'] ?? 'user',
            'isAdmin' => ($data['role'] ?? 'user') === 'admin',
            'allowedModels' => $data['allowedModels'] ?? ['all']
        ];
        if (isset($data['preferences'])) {
            $newUser['preferences'] = $data['preferences'];
        }
        $users[] = $newUser;
    }
    
    file_put_contents($usersFile, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true]);
}

function deleteUser($userId) {
    // Prevent deleting admin
    if ($userId === 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Cannot delete admin user']);
        return;
    }
    
    $usersFile = DATA_DIR . '/users.json';
    if (!file_exists($usersFile)) {
        http_response_code(404);
        echo json_encode(['error' => 'Users file not found']);
        return;
    }
    
    $users = json_decode(file_get_contents($usersFile), true) ?? [];
    $users = array_values(array_filter($users, function($user) use ($userId) {
        return $user['id'] !== $userId;
    }));
    
    file_put_contents($usersFile, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true]);
}

function getUserPreferences($userId) {
    $usersFile = DATA_DIR . '/users.json';
    if (!file_exists($usersFile)) {
        echo json_encode(new stdClass());
        return;
    }
    
    $users = json_decode(file_get_contents($usersFile), true) ?? [];
    foreach ($users as $user) {
        if ($user['id'] === $userId) {
            $preferences = $user['preferences'] ?? [];
            echo json_encode($preferences);
            return;
        }
    }
    
    // User not found, return defaults
    echo json_encode(new stdClass());
}

function saveUserPreferences($userId) {
    $data = getJsonInput();
    $mergedPreferences = [];
    
    $usersFile = DATA_DIR . '/users.json';
    $users = [];
    if (file_exists($usersFile)) {
        $users = json_decode(file_get_contents($usersFile), true) ?? [];
    }
    
    $found = false;
    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            $existingPreferences = (isset($user['preferences']) && is_array($user['preferences'])) ? $user['preferences'] : [];
            $incomingPreferences = is_array($data) ? $data : [];
            $user['preferences'] = array_merge($existingPreferences, $incomingPreferences);
            $mergedPreferences = $user['preferences'];
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        return;
    }
    
    file_put_contents($usersFile, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'preferences' => $mergedPreferences]);
}

function loginUser() {
    $data = getJsonInput();
    
    if (!isset($data['username']) || !isset($data['password'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password required']);
        return;
    }
    
    $usersFile = DATA_DIR . '/users.json';
    if (!file_exists($usersFile)) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        return;
    }
    
    $users = json_decode(file_get_contents($usersFile), true) ?? [];
    
    $username = $data['username'];
    $passwordHash = $data['password']; // Client sends SHA256 hash
    
    foreach ($users as $user) {
        if (strcasecmp($user['username'], $username) === 0) {
            // Compare hashes using hash_equals for timing-safe comparison
            if (hash_equals($user['password'], $passwordHash)) {
                // Success
                $responseUser = [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'role' => $user['role'],
                    'allowedModels' => $user['allowedModels']
                ];
                echo json_encode(['success' => true, 'user' => $responseUser]);
                return;
            } else {
                // Password mismatch for this user
                http_response_code(401);
                echo json_encode(['error' => 'Invalid credentials']);
                return;
            }
        }
    }
    
    // User not found
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
}
