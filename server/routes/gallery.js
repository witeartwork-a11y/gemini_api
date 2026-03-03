import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// CORS middleware for external gallery endpoints (cross-origin access)
const externalCors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
};

// GET /api/key — get or generate external gallery API key (admin)
router.get('/key', authMiddleware, adminOnly, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const keyFile = path.join(DATA_DIR, 'global_api_key.txt');

        let key;
        if (await fs.pathExists(keyFile)) {
            key = (await fs.readFile(keyFile, 'utf-8')).trim();
        } else {
            key = crypto.randomBytes(16).toString('hex');
            await fs.writeFile(keyFile, key);
        }

        res.json({ apiKey: key });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// OPTIONS preflight for external_gallery
router.options('/external_gallery', externalCors);

// GET /api/external_gallery?key=... — public, returns all gallery items
router.get('/external_gallery', externalCors, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const key = req.query.key || '';
        const keyFile = path.join(DATA_DIR, 'global_api_key.txt');

        if (!(await fs.pathExists(keyFile)) || (await fs.readFile(keyFile, 'utf-8')).trim() !== key) {
            return res.status(401).json({ error: 'Invalid API Key' });
        }

        // Build absolute base URL (like PHP's PORT constant)
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        // Load hidden users from settings
        let hiddenUsers = [];
        const settingsFile = path.join(DATA_DIR, 'system_settings.json');
        if (await fs.pathExists(settingsFile)) {
            const settings = await fs.readJson(settingsFile);
            if (Array.isArray(settings?.externalGalleryHiddenUsers)) {
                hiddenUsers = settings.externalGalleryHiddenUsers;
            }
        }

        // Helper: process a single entry, adding URLs
        const processEntry = (entry, userId) => {
            if (entry.imageRelativePath) {
                entry.imageUrl = `${baseUrl}/api/files/${userId}/${entry.imageRelativePath}`;
            }
            if (entry.thumbnailRelativePath) {
                entry.thumbnailUrl = `${baseUrl}/api/files/${userId}/${entry.thumbnailRelativePath}`;
            }
            return entry;
        };

        // Scan all user directories
        const allItems = [];
        const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
        const userDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

        for (const userDir of userDirs) {
            const userId = userDir.name;
            if (hiddenUsers.includes(userId)) continue;

            const logsDir = path.join(DATA_DIR, userId, 'logs');
            if (!(await fs.pathExists(logsDir))) continue;

            const topLevelItems = await fs.readdir(logsDir, { withFileTypes: true });

            // Legacy daily JSON files (e.g., 2026-01-29.json)
            const legacyFiles = topLevelItems
                .filter(item => item.isFile() && item.name.endsWith('.json'));

            for (const logFileEnt of legacyFiles) {
                try {
                    const logEntries = await fs.readJson(path.join(logsDir, logFileEnt.name));
                    const list = Array.isArray(logEntries) ? logEntries : [logEntries];
                    for (const entry of list) {
                        allItems.push(processEntry(entry, userId));
                    }
                } catch {
                    // Skip corrupt log files
                }
            }

            // New date-subfolder structure (e.g., logs/2026-03-01/timestamp_id.json)
            const dateFolders = topLevelItems
                .filter(item => item.isDirectory());

            for (const folder of dateFolders) {
                const folderPath = path.join(logsDir, folder.name);
                try {
                    const jsonFiles = (await fs.readdir(folderPath)).filter(f => f.endsWith('.json'));
                    for (const jf of jsonFiles) {
                        try {
                            const entry = await fs.readJson(path.join(folderPath, jf));
                            allItems.push(processEntry(entry, userId));
                        } catch {
                            // Skip corrupt entry files
                        }
                    }
                } catch {
                    // Skip unreadable folders
                }
            }
        }

        // Sort newest first
        allItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json(allItems);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
