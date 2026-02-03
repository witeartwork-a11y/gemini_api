
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Emulate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Ensure base data directory exists
fs.ensureDirSync(DATA_DIR);

const getUserDir = (userId) => path.join(DATA_DIR, userId);

// --- NEW: Serve Static Files (Optimized Image Delivery) ---
// FIX: Using RegExp for routing to avoid path-to-regexp syntax errors in Express 5
// Captures /api/files/{userId}/{rest_of_path}
app.get(/^\/api\/files\/([^\/]+)\/(.*)$/, (req, res) => {
    const userId = req.params[0];
    const relativePath = req.params[1];
    
    // Basic security: prevent traversing up directories
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    
    const filePath = path.join(DATA_DIR, userId, safePath);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

// 1. Save Generation
app.post('/api/save', async (req, res) => {
    try {
        const { userId, type, model, prompt, image, text, aspectRatio, timestamp, usageMetadata, estimatedCost, inputImageInfo, outputResolution } = req.body;
        
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const dateStr = new Date().toISOString().split('T')[0];
        const userDir = getUserDir(userId);
        
        // Define paths
        // Images: data/{userId}/images/{date}/
        const imagesDir = path.join(userDir, 'images', dateStr);
        // Logs: data/{userId}/logs/{date}/
        const logsDir = path.join(userDir, 'logs', dateStr);
        
        await fs.ensureDir(imagesDir);
        await fs.ensureDir(logsDir);

        const id = Math.random().toString(36).substring(2, 9);
        const baseFilename = `${timestamp}_${id}`;
        
        let imageFilename = null;

        // 1. Save Image File (Clean .png only in images folder)
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            imageFilename = `${baseFilename}.png`;
            await fs.writeFile(path.join(imagesDir, imageFilename), buffer);
        }

        // 2. Save Metadata File (One JSON per generation)
        const logFilePath = path.join(logsDir, `${baseFilename}.json`);
        
        const metaEntry = {
            id,
            timestamp,
            dateStr,
            userId,
            type, // 'single', 'batch', 'cloud'
            model,
            prompt,
            // Store relative path (cross-platform compatible)
            imageRelativePath: imageFilename ? `images/${dateStr}/${imageFilename}` : null,
            resultText: text || null,
            aspectRatio,
            usageMetadata,
            estimatedCost,
            inputImageInfo,
            outputResolution
        };

        await fs.writeJson(logFilePath, metaEntry, { spaces: 2 });

        res.json({ success: true, id });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Get History (OPTIMIZED: No fs.readFile for images)
app.get('/api/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { date } = req.query; // Optional date filter
        
        const userDir = getUserDir(userId);
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.json([]);
        }

        let historyItems = [];
        
        // Helper to process a single entry found in a file
        const processEntry = (entry) => {
            if (entry.imageRelativePath) {
                // Construct URL pointing to the new static file endpoint
                entry.imageUrl = `/api/files/${userId}/${entry.imageRelativePath}`;
                delete entry.image; 
            }
            return entry;
        };

        // Get list of all items in logsDir (files or directories)
        const topLevelItems = await fs.readdir(logsDir, { withFileTypes: true });

        // 1. Handle Legacy Daily JSONs (files in logs/)
        const legacyFiles = topLevelItems
            .filter(item => item.isFile() && item.name.endsWith('.json'))
            .filter(item => !date || item.name === `${date}.json`)
            .map(item => path.join(logsDir, item.name));

        for (const logFile of legacyFiles) {
            try {
                const entries = await fs.readJson(logFile);
                if (Array.isArray(entries)) {
                    entries.forEach(e => historyItems.push(processEntry(e)));
                } else {
                    // Single object fallback
                    historyItems.push(processEntry(entries));
                }
            } catch (e) { console.warn(`Error reading legacy log ${logFile}`, e); }
        }

        // 2. Handle New Folder Structure (folders in logs/)
        const dateFolders = topLevelItems
            .filter(item => item.isDirectory())
            .filter(item => !date || item.name === date)
            .map(item => path.join(logsDir, item.name));

        for (const dateFolder of dateFolders) {
            try {
                const jsonFiles = (await fs.readdir(dateFolder))
                    .filter(f => f.endsWith('.json'))
                    .map(f => path.join(dateFolder, f));
                
                for (const jsonFile of jsonFiles) {
                    try {
                        const entry = await fs.readJson(jsonFile);
                        historyItems.push(processEntry(entry));
                    } catch (e) {
                         console.warn(`Error reading log file ${jsonFile}`, e);
                    }
                }
            } catch (e) { console.warn(`Error reading date folder ${dateFolder}`, e); }
        }
        
        // Sort by timestamp desc
        historyItems.sort((a, b) => b.timestamp - a.timestamp);

        res.json(historyItems);

    } catch (error) {
        console.error("Get history error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Delete History Item
app.delete('/api/history/:userId/:id', async (req, res) => {
    try {
        const { userId, id } = req.params;
        const userDir = getUserDir(userId);
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
             return res.status(404).json({ error: "No history found" });
        }

        // 1. Try to find in new structure (individual files)
        // We know filename ends in _{id}.json
        const topLevel = await fs.readdir(logsDir, { withFileTypes: true });
        
        // Check Folders first (New Structure)
        const dateFolders = topLevel.filter(d => d.isDirectory());
        
        for (const folder of dateFolders) {
            const folderPath = path.join(logsDir, folder.name);
            const files = await fs.readdir(folderPath);
            const targetFile = files.find(f => f.endsWith(`_${id}.json`));
            
            if (targetFile) {
                const fullPath = path.join(folderPath, targetFile);
                const entry = await fs.readJson(fullPath);
                
                // Delete Image
                if (entry.imageRelativePath) {
                    const imgPath = path.join(userDir, entry.imageRelativePath);
                    await fs.remove(imgPath);
                }
                
                // Delete Meta File
                await fs.remove(fullPath);
                return res.json({ success: true });
            }
        }

        // 2. Check Legacy Daily JSON files
        const legacyFiles = topLevel
            .filter(f => f.isFile() && f.name.endsWith('.json'))
            .map(f => path.join(logsDir, f.name));
            
        for (const logFile of legacyFiles) {
            try {
                const entries = await fs.readJson(logFile);
                if (Array.isArray(entries)) {
                    const index = entries.findIndex(e => e.id === id);
                    if (index !== -1) {
                        const item = entries[index];
                        if (item.imageRelativePath) {
                            await fs.remove(path.join(userDir, item.imageRelativePath));
                        }
                        entries.splice(index, 1);
                        
                        // If empty after delete, remove the daily file? Maybe not to avoid potential issues.
                        await fs.writeJson(logFile, entries, { spaces: 2 });
                        return res.json({ success: true });
                    }
                }
            } catch (e) {}
        }

        res.status(404).json({ error: "Item not found" });

    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Admin Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
        const users = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
        
        const stats = {
            users: {},
            timeline: {}
        };

        for (const userId of users) {
             const logsDir = path.join(DATA_DIR, userId, 'logs');
             if (await fs.pathExists(logsDir)) {
                 stats.users[userId] = { totalTokens: 0, totalCost: 0, count: 0 };
                 
                 const topLevel = await fs.readdir(logsDir, { withFileTypes: true });
                 
                 // Process Legacy Files
                 const legacyFiles = topLevel.filter(d => d.isFile() && d.name.endsWith('.json'));
                 for (const fileEnt of legacyFiles) {
                     const dateStr = fileEnt.name.replace('.json', '');
                     try {
                         const entries = await fs.readJson(path.join(logsDir, fileEnt.name));
                         if (!stats.timeline[dateStr]) stats.timeline[dateStr] = { tokens: 0, cost: 0, count: 0 };
                         
                         const list = Array.isArray(entries) ? entries : [entries];
                         for (const entry of list) {
                             const tokens = entry.usageMetadata?.totalTokenCount || 0;
                             const cost = entry.estimatedCost || 0;
                             
                             stats.users[userId].totalTokens += tokens;
                             stats.users[userId].totalCost += cost;
                             stats.users[userId].count += 1;

                             stats.timeline[dateStr].tokens += tokens;
                             stats.timeline[dateStr].cost += cost;
                             stats.timeline[dateStr].count += 1;
                         }
                     } catch(e) {}
                 }

                 // Process New Folders
                 const dateFolders = topLevel.filter(d => d.isDirectory());
                 for (const folderEnt of dateFolders) {
                     const dateStr = folderEnt.name;
                     const folderPath = path.join(logsDir, dateStr);
                     try {
                         const jsonFiles = (await fs.readdir(folderPath)).filter(f => f.endsWith('.json'));
                         if (!stats.timeline[dateStr]) stats.timeline[dateStr] = { tokens: 0, cost: 0, count: 0 };
                         
                         for (const jf of jsonFiles) {
                             try {
                                const entry = await fs.readJson(path.join(folderPath, jf));
                                const tokens = entry.usageMetadata?.totalTokenCount || 0;
                                const cost = entry.estimatedCost || 0;
                                
                                stats.users[userId].totalTokens += tokens;
                                stats.users[userId].totalCost += cost;
                                stats.users[userId].count += 1;

                                stats.timeline[dateStr].tokens += tokens;
                                stats.timeline[dateStr].cost += cost;
                                stats.timeline[dateStr].count += 1;
                             } catch(e) {}
                         }
                     } catch(e) {}
                 }
            }
        }
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. User Persistence
const USERS_FILE = path.join(DATA_DIR, 'users.json');

app.get('/api/users', async (req, res) => {
    try {
        if (await fs.pathExists(USERS_FILE)) {
            const users = await fs.readJson(USERS_FILE);
            res.json(users);
        } else {
            // Return empty array (or default admin handled by client if empty)
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const users = req.body;
        await fs.writeJson(USERS_FILE, users, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (!await fs.pathExists(USERS_FILE)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const users = await fs.readJson(USERS_FILE);

        // Find user with matching username (case-insensitive)
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password hash (client sends SHA256 hash)
        if (user.password === password) {
            // Success - return user without password hash
            const responseUser = {
                id: user.id,
                username: user.username,
                role: user.role,
                allowedModels: user.allowedModels
            };
            return res.json({ success: true, user: responseUser });
        } else {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 6. System Settings Persistence
const SETTINGS_FILE = path.join(DATA_DIR, 'system_settings.json');

app.get('/api/system-settings', async (req, res) => {
    try {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const settings = await fs.readJson(SETTINGS_FILE);
            res.json(settings);
        } else {
            res.json(null);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/system-settings', async (req, res) => {
    try {
        const settings = req.body;
        await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Cloud Jobs Persistence
app.get('/api/cloud-jobs/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const userDir = getUserDir(userId);
        const jobsFile = path.join(userDir, 'cloud_jobs.json');
        
        if (await fs.pathExists(jobsFile)) {
            const jobs = await fs.readJson(jobsFile);
            res.json(jobs);
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/cloud-jobs/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const jobs = req.body;
        const userDir = getUserDir(userId);
        await fs.ensureDir(userDir);
        const jobsFile = path.join(userDir, 'cloud_jobs.json');
        
        await fs.writeJson(jobsFile, jobs, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data stored in ${DATA_DIR}`);
});
