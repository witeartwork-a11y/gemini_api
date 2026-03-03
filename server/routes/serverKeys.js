import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { keyRevealLimiter } from '../middleware/rateLimit.js';
import { encryptApiKey, decryptApiKey } from '../utils/encryption.js';
import logger from '../utils/logger.js';

const router = Router();

const loadServerKeys = async (dataDir) => {
    const keysFile = path.join(dataDir, 'server_api_keys.json');
    if (await fs.pathExists(keysFile)) {
        return await fs.readJson(keysFile);
    }
    return [];
};

const saveServerKeys = async (dataDir, keys) => {
    const keysFile = path.join(dataDir, 'server_api_keys.json');
    await fs.writeJson(keysFile, keys, { spaces: 2 });
};

const maskApiKey = (rawKey) => {
    const key = rawKey?.startsWith('enc:') ? '(encrypted)' : rawKey;
    if (!key || key.length <= 8) return '****' + (key ? key.slice(-2) : '');
    return '****' + key.slice(-4);
};

// Key access logging
const logKeyAccess = async (dataDir, action, keyId, userId) => {
    try {
        const logFile = path.join(dataDir, 'key_access_log.json');
        let logs = [];
        if (await fs.pathExists(logFile)) {
            logs = await fs.readJson(logFile);
        }
        logs.push({
            action,
            keyId,
            userId,
            timestamp: new Date().toISOString()
        });
        if (logs.length > 1000) logs = logs.slice(-1000);
        await fs.writeJson(logFile, logs, { spaces: 2 });
    } catch (e) {
        logger.error('Key access log error', { error: e.message });
    }
};

// Migrate unencrypted keys to encrypted on load
export const migrateKeysEncryption = async (dataDir) => {
    const keys = await loadServerKeys(dataDir);
    let changed = false;
    for (const k of keys) {
        if (k.key && !k.key.startsWith('enc:')) {
            k.key = encryptApiKey(k.key);
            changed = true;
        }
    }
    if (changed) {
        await saveServerKeys(dataDir, keys);
        logger.info('Migrated API keys to encrypted storage');
    }
};

// GET /api/server-keys — list keys (filtered by user access)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const keys = await loadServerKeys(DATA_DIR);
        const isAdmin = req.sessionUserRole === 'admin';
        const userId = req.sessionUserId;

        const result = keys
            .filter(k => {
                if (isAdmin) return true;
                return k.enabled && (
                    (k.allowedUsers || []).includes('all') ||
                    (k.allowedUsers || []).includes(userId)
                );
            })
            .map(k => ({
                id: k.id,
                provider: k.provider,
                label: k.label,
                maskedKey: maskApiKey(k.key),
                enabled: k.enabled,
                allowedUsers: k.allowedUsers || [],
                createdAt: k.createdAt || '',
            }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/server-keys — create or update (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const data = req.body;
        if (!data.provider || !data.label) {
            return res.status(400).json({ error: 'Provider and label are required' });
        }

        const keys = await loadServerKeys(DATA_DIR);

        if (data.id) {
            const idx = keys.findIndex(k => k.id === data.id);
            if (idx === -1) return res.status(404).json({ error: 'Key not found' });
            keys[idx].provider = data.provider;
            keys[idx].label = data.label;
            if (data.key) keys[idx].key = encryptApiKey(data.key);
            if (data.enabled !== undefined) keys[idx].enabled = !!data.enabled;
            if (data.allowedUsers) keys[idx].allowedUsers = data.allowedUsers;
            await logKeyAccess(DATA_DIR, 'update', data.id, req.sessionUserId);
        } else {
            if (!data.key) return res.status(400).json({ error: 'API key value is required' });
            const newId = 'skey_' + crypto.randomBytes(8).toString('hex');
            keys.push({
                id: newId,
                provider: data.provider,
                label: data.label,
                key: encryptApiKey(data.key),
                enabled: data.enabled !== undefined ? !!data.enabled : true,
                allowedUsers: data.allowedUsers || ['all'],
                createdAt: new Date().toISOString(),
            });
            await logKeyAccess(DATA_DIR, 'create', newId, req.sessionUserId);
        }

        await saveServerKeys(DATA_DIR, keys);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/server-keys/:id — admin only
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        let keys = await loadServerKeys(DATA_DIR);
        const keyId = req.params.id;
        keys = keys.filter(k => k.id !== keyId);
        await saveServerKeys(DATA_DIR, keys);
        await logKeyAccess(DATA_DIR, 'delete', keyId, req.sessionUserId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/server-keys/:id/toggle — admin only
router.post('/:id/toggle', authMiddleware, adminOnly, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const keys = await loadServerKeys(DATA_DIR);
        const key = keys.find(k => k.id === req.params.id);
        if (!key) return res.status(404).json({ error: 'Key not found' });
        key.enabled = !key.enabled;
        await saveServerKeys(DATA_DIR, keys);
        await logKeyAccess(DATA_DIR, 'toggle', req.params.id, req.sessionUserId);
        res.json({ success: true, enabled: key.enabled });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/server-keys/:id/reveal — authorized users
router.get('/:id/reveal', authMiddleware, keyRevealLimiter, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const keys = await loadServerKeys(DATA_DIR);
        const key = keys.find(k => k.id === req.params.id);
        if (!key) return res.status(404).json({ error: 'Key not found' });
        if (!key.enabled) return res.status(403).json({ error: 'Key is disabled' });

        const isAdmin = req.sessionUserRole === 'admin';
        const hasAccess = (key.allowedUsers || []).includes('all') || (key.allowedUsers || []).includes(req.sessionUserId);
        if (!isAdmin && !hasAccess) return res.status(403).json({ error: 'Access denied' });

        await logKeyAccess(DATA_DIR, 'reveal', req.params.id, req.sessionUserId);
        const decryptedKey = decryptApiKey(key.key);
        res.json({ key: decryptedKey, provider: key.provider });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
