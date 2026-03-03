import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { validateUserId } from '../utils/validation.js';

const router = Router();

// Public endpoint — no auth required (images accessed by URL in UI)
// CORS allowed for cross-origin access (external gallery embedding)
router.get(/^\/([^\/]+)\/(.*)$/, (req, res) => {
    const userId = req.params[0];
    const relativePath = req.params[1];

    if (!validateUserId(userId)) {
        return res.status(400).send('Invalid user ID');
    }

    const DATA_DIR = req.app.get('DATA_DIR');
    const fullPath = path.resolve(DATA_DIR, userId, relativePath);
    const expectedBase = path.resolve(DATA_DIR);

    if (!fullPath.startsWith(expectedBase + path.sep) && fullPath !== expectedBase) {
        return res.status(403).send('Access denied');
    }

    // Allow cross-origin access for external gallery consumers
    res.set('Access-Control-Allow-Origin', '*');

    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('Not found');
    }
});

export default router;
