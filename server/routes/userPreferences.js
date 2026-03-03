import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, userAccessMiddleware } from '../middleware/auth.js';
import { validateUserId } from '../utils/validation.js';

const router = Router();

// GET /api/user-preferences/:userId
router.get('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const prefsFile = path.join(req.app.get('DATA_DIR'), userId, 'preferences.json');
        if (await fs.pathExists(prefsFile)) {
            const prefs = await fs.readJson(prefsFile);
            res.json(prefs);
        } else {
            res.json({});
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/user-preferences/:userId (merges with existing, like PHP)
router.post('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const userDir = path.join(req.app.get('DATA_DIR'), userId);
        await fs.ensureDir(userDir);
        const prefsFile = path.join(userDir, 'preferences.json');
        
        // Load existing and merge
        let existing = {};
        if (await fs.pathExists(prefsFile)) {
            existing = await fs.readJson(prefsFile) || {};
        }
        const merged = { ...existing, ...req.body };
        
        await fs.writeJson(prefsFile, merged, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
