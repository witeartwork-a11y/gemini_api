import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// Default system settings (matches PHP defaults)
const DEFAULT_SYSTEM_SETTINGS = {
    showCreativity: true,
    showRepeats: true,
    showImageSearch: false,
    showGoogleSearch: false,
    theme: 'default',
    language: 'en',
    newYearMode: false,
    safetySettings: [],
    mediaResolution: 'HIGH',
    apiProvider: 'google',
    externalGalleryHiddenUsers: []
};

// GET /api/system-settings — public (language/theme needed before login)
router.get('/', async (req, res) => {
    try {
        const settingsFile = path.join(req.app.get('DATA_DIR'), 'system_settings.json');
        if (await fs.pathExists(settingsFile)) {
            const settings = await fs.readJson(settingsFile);
            res.json(settings);
        } else {
            // Return defaults (like PHP does)
            res.json({ ...DEFAULT_SYSTEM_SETTINGS });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/system-settings — admin only (merges with existing, like PHP)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const settingsFile = path.join(req.app.get('DATA_DIR'), 'system_settings.json');
        
        // Load existing settings and merge with incoming data
        let existing = {};
        if (await fs.pathExists(settingsFile)) {
            existing = await fs.readJson(settingsFile) || {};
        }
        const merged = { ...existing, ...req.body };
        
        await fs.writeJson(settingsFile, merged, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
