import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, userAccessMiddleware } from '../middleware/auth.js';
import { validateUserId, getUserDir } from '../utils/validation.js';
import { mergeCloudJobs } from '../utils/mergeJobs.js';

const router = Router();

// GET /api/cloud-jobs/:userId
router.get('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
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

// POST /api/cloud-jobs/:userId
router.post('/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const incomingJobs = Array.isArray(req.body) ? req.body : [];
        const DATA_DIR = req.app.get('DATA_DIR');
        const userDir = getUserDir(DATA_DIR, userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
        await fs.ensureDir(userDir);
        const jobsFile = path.join(userDir, 'cloud_jobs.json');

        let existingJobs = [];
        if (await fs.pathExists(jobsFile)) {
            const loaded = await fs.readJson(jobsFile);
            existingJobs = Array.isArray(loaded) ? loaded : [];
        }

        const mergedJobs = mergeCloudJobs(existingJobs, incomingJobs);
        await fs.writeJson(jobsFile, mergedJobs, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
