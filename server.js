
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
        const { userId, type, model, prompt, image, text, aspectRatio, timestamp } = req.body;
        
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const dateStr = new Date().toISOString().split('T')[0];
        const userDir = getUserDir(userId);
        
        // Define paths
        // Images: data/{userId}/images/{date}/
        const imagesDir = path.join(userDir, 'images', dateStr);
        // Logs: data/{userId}/logs/
        const logsDir = path.join(userDir, 'logs');
        
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

        // 2. Update Daily Log (Consolidated JSON)
        const logFilePath = path.join(logsDir, `${dateStr}.json`);
        
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
            aspectRatio
        };

        let dailyLog = [];
        if (await fs.pathExists(logFilePath)) {
            try {
                dailyLog = await fs.readJson(logFilePath);
                if (!Array.isArray(dailyLog)) dailyLog = [];
            } catch (e) {
                console.warn("Could not read daily log, starting new:", e);
            }
        }
        
        dailyLog.push(metaEntry);
        await fs.writeJson(logFilePath, dailyLog, { spaces: 2 });

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
        let logFiles = [];

        // If specific date requested
        if (date) {
            const specificLog = path.join(logsDir, `${date}.json`);
            if (fs.existsSync(specificLog)) {
                logFiles.push(specificLog);
            }
        } else {
            // Read all logs
            const files = await fs.readdir(logsDir);
            logFiles = files.filter(f => f.endsWith('.json')).map(f => path.join(logsDir, f));
        }

        for (const logFile of logFiles) {
            try {
                const entries = await fs.readJson(logFile);
                if (Array.isArray(entries)) {
                    // Populate URL instead of Base64
                    for (const entry of entries) {
                        if (entry.imageRelativePath) {
                            // Construct URL pointing to the new static file endpoint
                            entry.imageUrl = `http://localhost:${PORT}/api/files/${userId}/${entry.imageRelativePath}`;
                            // Remove legacy base64 if it accidentally got saved in JSON in very old versions
                            delete entry.image; 
                        }
                        historyItems.push(entry);
                    }
                }
            } catch (e) {
                console.warn(`Error reading log ${logFile}:`, e);
            }
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

        const files = await fs.readdir(logsDir);
        const logFiles = files.filter(f => f.endsWith('.json')).map(f => path.join(logsDir, f));

        let found = false;

        for (const logFile of logFiles) {
            const entries = await fs.readJson(logFile);
            const index = entries.findIndex(e => e.id === id);
            
            if (index !== -1) {
                const item = entries[index];
                
                // 1. Delete image file if exists
                if (item.imageRelativePath) {
                    const imgPath = path.join(userDir, item.imageRelativePath);
                    await fs.remove(imgPath);
                }

                // 2. Remove from JSON
                entries.splice(index, 1);
                await fs.writeJson(logFile, entries, { spaces: 2 });
                found = true;
                break;
            }
        }

        if (found) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Item not found" });
        }

    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data stored in ${DATA_DIR}`);
});
