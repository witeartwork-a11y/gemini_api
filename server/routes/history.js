import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { authMiddleware, userAccessMiddleware } from '../middleware/auth.js';
import { validateUserId, validateSaveBody, getUserDir } from '../utils/validation.js';
import { createThumbnail, ensureThumbnail } from '../utils/thumbnail.js';
import logger from '../utils/logger.js';

const router = Router();

// Save Generation
router.post('/save', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const validationError = validateSaveBody(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        const DATA_DIR = req.app.get('DATA_DIR');
        const { userId, type, model, prompt, image, text, aspectRatio, timestamp,
            usageMetadata, estimatedCost, inputImageInfo, outputResolution,
            authorName, workId } = req.body;

        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });

        const dateStr = new Date().toISOString().split('T')[0];
        const imagesDir = path.join(userDir, 'images', dateStr);
        const logsDir = path.join(userDir, 'logs', dateStr);

        await fs.ensureDir(imagesDir);
        await fs.ensureDir(logsDir);

        const safeTimestamp = Number(timestamp) || Date.now();
        const id = Math.random().toString(36).substring(2, 9);
        const baseFilename = `${safeTimestamp}_${id}`;

        let imageFilename = null;
        let imageSha256 = null;
        let thumbnailRelPath = null;

        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            imageSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
            imageFilename = `${baseFilename}.png`;
            await fs.writeFile(path.join(imagesDir, imageFilename), buffer);

            // Generate thumbnail (non-blocking — don't fail save if thumbnail fails)
            thumbnailRelPath = await createThumbnail(userDir, dateStr, imageFilename, buffer);
        }

        const promptHash = prompt
            ? crypto.createHash('sha256').update(String(prompt), 'utf8').digest('hex')
            : null;

        const provenance = {
            schema: 'wite.provenance.v1',
            workId: workId || `${safeTimestamp}_${id}`,
            createdAtUtc: new Date(safeTimestamp).toISOString(),
            recordedAtUtc: new Date().toISOString(),
            authorId: userId,
            authorName: authorName || null,
            model,
            outputResolution: outputResolution || null,
            aspectRatio: aspectRatio || null,
            inputImagesCount: inputImageInfo?.count ?? null,
            imageSha256,
            promptHash,
            app: 'gemini_api'
        };
        const provenanceDigest = crypto
            .createHash('sha256')
            .update(JSON.stringify(provenance), 'utf8')
            .digest('hex');

        const logFilePath = path.join(logsDir, `${baseFilename}.json`);
        const metaEntry = {
            id,
            timestamp: safeTimestamp,
            dateStr,
            userId,
            type,
            model,
            prompt,
            imageRelativePath: imageFilename ? `images/${dateStr}/${imageFilename}` : null,
            thumbnailRelativePath: thumbnailRelPath,
            resultText: text || null,
            aspectRatio,
            usageMetadata,
            estimatedCost,
            inputImageInfo,
            outputResolution,
            provenance: {
                ...provenance,
                recordDigest: provenanceDigest
            }
        };

        await fs.writeJson(logFilePath, metaEntry, { spaces: 2 });
        res.json({ success: true, id });
    } catch (error) {
        logger.error('Save error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get History
router.get('/history/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { date } = req.query;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });

        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.json([]);
        }

        let historyItems = [];

        const processEntry = async (entry) => {
            if (entry.imageRelativePath) {
                entry.imageUrl = `/api/files/${userId}/${entry.imageRelativePath}`;
                delete entry.image;

                // Ensure thumbnail exists (on-demand generation for legacy images)
                if (!entry.thumbnailRelativePath) {
                    const thumbRel = await ensureThumbnail(userDir, entry.imageRelativePath);
                    if (thumbRel) {
                        entry.thumbnailRelativePath = thumbRel;
                    }
                }
            }
            if (entry.thumbnailRelativePath) {
                entry.thumbnailUrl = `/api/files/${userId}/${entry.thumbnailRelativePath}`;
            }
            return entry;
        };

        const topLevelItems = await fs.readdir(logsDir, { withFileTypes: true });

        // Legacy daily JSONs
        const legacyFiles = topLevelItems
            .filter(item => item.isFile() && item.name.endsWith('.json'))
            .filter(item => !date || item.name === `${date}.json`)
            .map(item => path.join(logsDir, item.name));

        for (const logFile of legacyFiles) {
            try {
                const entries = await fs.readJson(logFile);
                if (Array.isArray(entries)) {
                    for (const e of entries) {
                        historyItems.push(await processEntry(e));
                    }
                } else {
                    historyItems.push(await processEntry(entries));
                }
            } catch (e) { logger.warn(`Error reading legacy log`, { file: logFile }); }
        }

        // New folder structure
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
                        historyItems.push(await processEntry(entry));
                    } catch (e) { logger.warn(`Error reading log file`, { file: jsonFile }); }
                }
            } catch (e) { logger.warn(`Error reading date folder`, { folder: dateFolder }); }
        }

        historyItems.sort((a, b) => b.timestamp - a.timestamp);
        res.json(historyItems);
    } catch (error) {
        logger.error('Get history error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Delete History Item
router.delete('/history/:userId/:id', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId, id } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });

        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.status(404).json({ error: "No history found" });
        }

        const topLevel = await fs.readdir(logsDir, { withFileTypes: true });
        const dateFolders = topLevel.filter(d => d.isDirectory());

        for (const folder of dateFolders) {
            const folderPath = path.join(logsDir, folder.name);
            const files = await fs.readdir(folderPath);
            const targetFile = files.find(f => f.endsWith(`_${id}.json`));

            if (targetFile) {
                const fullPath = path.join(folderPath, targetFile);
                const entry = await fs.readJson(fullPath);
                if (entry.imageRelativePath) {
                    const imgPath = path.join(userDir, entry.imageRelativePath);
                    await fs.remove(imgPath);
                }
                if (entry.thumbnailRelativePath) {
                    const thumbPath = path.join(userDir, entry.thumbnailRelativePath);
                    await fs.remove(thumbPath).catch(() => {});
                }
                await fs.remove(fullPath);
                return res.json({ success: true });
            }
        }

        // Legacy daily JSON files
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
                        if (item.thumbnailRelativePath) {
                            await fs.remove(path.join(userDir, item.thumbnailRelativePath)).catch(() => {});
                        }
                        entries.splice(index, 1);
                        await fs.writeJson(logFile, entries, { spaces: 2 });
                        return res.json({ success: true });
                    }
                }
            } catch (e) { /* skip */ }
        }

        res.status(404).json({ error: "Item not found" });
    } catch (error) {
        logger.error('Delete error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Admin Stats
router.get('/admin/stats', authMiddleware, (req, res, next) => {
    if (req.sessionUserRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
        const users = entries.filter(d => d.isDirectory()).map(d => d.name);

        const stats = { users: {}, timeline: {} };

        for (const userId of users) {
            const logsDir = path.join(DATA_DIR, userId, 'logs');
            if (await fs.pathExists(logsDir)) {
                stats.users[userId] = { totalTokens: 0, totalCost: 0, count: 0 };

                const topLevel = await fs.readdir(logsDir, { withFileTypes: true });

                // Legacy files
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
                    } catch (e) { /* skip */ }
                }

                // New folder structure
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
                            } catch (e) { /* skip */ }
                        }
                    } catch (e) { /* skip */ }
                }
            }
        }
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
