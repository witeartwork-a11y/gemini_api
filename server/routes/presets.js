import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

const getPresetsFile = (req) => {
    const DATA_DIR = req.app.get('DATA_DIR');
    return path.join(DATA_DIR, 'presets.json');
};

// GET /api/presets — public, anyone can read presets
router.get('/', async (req, res) => {
    try {
        const presetsFile = getPresetsFile(req);
        if (await fs.pathExists(presetsFile)) {
            const presets = await fs.readJson(presetsFile);
            res.json(presets ?? []);
        } else {
            await fs.writeJson(presetsFile, [], { spaces: 2 });
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/presets — admin only, create/update preset
router.post('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { name, content } = req.body;
        if (!name || content === undefined) {
            return res.status(400).json({ error: 'Name and content are required' });
        }

        const presetsFile = getPresetsFile(req);
        let presets = [];
        if (await fs.pathExists(presetsFile)) {
            presets = (await fs.readJson(presetsFile)) ?? [];
        }

        // Update existing or add new
        const idx = presets.findIndex(p => p.name === name);
        if (idx >= 0) {
            presets[idx].content = content;
        } else {
            presets.push({ name, content });
        }

        await fs.writeJson(presetsFile, presets, { spaces: 2 });
        res.json({ success: true, presets });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/presets — admin only, delete preset by name (query or body)
router.delete('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const name = req.query.name || req.body?.name;
        if (!name) {
            return res.status(400).json({ error: 'Preset name is required' });
        }

        const presetsFile = getPresetsFile(req);
        if (!(await fs.pathExists(presetsFile))) {
            return res.status(404).json({ error: 'Presets file not found' });
        }

        let presets = (await fs.readJson(presetsFile)) ?? [];
        presets = presets.filter(p => p.name !== name);

        await fs.writeJson(presetsFile, presets, { spaces: 2 });
        res.json({ success: true, presets });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/presets/:name — legacy path-based delete
router.delete('/:name', authMiddleware, adminOnly, async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        const presetsFile = getPresetsFile(req);
        if (!(await fs.pathExists(presetsFile))) {
            return res.status(404).json({ error: 'Presets file not found' });
        }

        let presets = (await fs.readJson(presetsFile)) ?? [];
        presets = presets.filter(p => p.name !== name);

        await fs.writeJson(presetsFile, presets, { spaces: 2 });
        res.json({ success: true, presets });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
