import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, userAccessMiddleware } from '../middleware/auth.js';
import { validateUserId, getUserDir } from '../utils/validation.js';

const router = Router();

// GET /api/settings/:userId — get per-user settings
router.get('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });

        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });

        const settingsFile = path.join(userDir, 'settings.json');
        if (await fs.pathExists(settingsFile)) {
            const settings = await fs.readJson(settingsFile);
            res.json(settings);
        } else {
            res.json({});
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/settings/:userId — save per-user settings
router.post('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });

        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });

        await fs.ensureDir(userDir);
        const settingsFile = path.join(userDir, 'settings.json');
        await fs.writeJson(settingsFile, req.body, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
