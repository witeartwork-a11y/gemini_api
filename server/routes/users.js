import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { authMiddleware, adminOnly, createSession, deleteSession,
    hashPasswordPBKDF2, verifyPasswordPBKDF2 } from '../middleware/auth.js';
import { validateUserId } from '../utils/validation.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import logger from '../utils/logger.js';

const router = Router();

// Normalize users data (handle legacy formats)
const normalizeUsersData = (raw) => {
    if (Array.isArray(raw)) {
        return raw.filter(user => user && typeof user === 'object' && user.id && user.username);
    }
    if (raw && typeof raw === 'object' && raw.id && raw.username) {
        return [raw];
    }
    return [];
};

const loadUsers = async (dataDir) => {
    const usersFile = path.join(dataDir, 'users.json');
    if (!await fs.pathExists(usersFile)) return [];
    const raw = await fs.readJson(usersFile);
    const users = normalizeUsersData(raw);
    if (!Array.isArray(raw)) {
        await fs.writeJson(usersFile, users, { spaces: 2 });
    }
    return users;
};

const upsertUser = (users, incomingUser) => {
    if (!incomingUser || typeof incomingUser !== 'object' || !incomingUser.id || !incomingUser.username) {
        return users;
    }
    // Set isAdmin flag for backward compatibility with PHP (like PHP's saveUser())
    incomingUser.isAdmin = (incomingUser.role === 'admin');
    
    const userIndex = users.findIndex(user => user.id === incomingUser.id);
    if (userIndex === -1) return [...users, incomingUser];
    const mergedUser = { ...users[userIndex], ...incomingUser };
    const updatedUsers = [...users];
    updatedUsers[userIndex] = mergedUser;
    return updatedUsers;
};

// GET /api/users — admin sees all (passwords stripped)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const users = await loadUsers(req.app.get('DATA_DIR'));
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            allowedModels: u.allowedModels
        }));
        res.json(safeUsers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/users — admin create/update
router.post('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const DATA_DIR = req.app.get('DATA_DIR');
        const usersFile = path.join(DATA_DIR, 'users.json');
        const incoming = req.body;
        let usersToSave = [];

        if (Array.isArray(incoming)) {
            usersToSave = normalizeUsersData(incoming);
        } else {
            const existingUsers = await loadUsers(DATA_DIR);
            usersToSave = upsertUser(existingUsers, incoming);
        }

        await fs.writeJson(usersFile, usersToSave, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/login — public, rate-limited
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const users = await loadUsers(req.app.get('DATA_DIR'));
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const result = await verifyPasswordPBKDF2(password, user.password);
        if (result.match) {
            // Migrate legacy SHA256 to PBKDF2 on successful login
            if (result.needsMigration) {
                const DATA_DIR = req.app.get('DATA_DIR');
                const usersFile = path.join(DATA_DIR, 'users.json');
                const newHash = await hashPasswordPBKDF2(password);
                user.password = newHash;
                const allUsers = await loadUsers(DATA_DIR);
                const idx = allUsers.findIndex(u => u.id === user.id);
                if (idx !== -1) {
                    allUsers[idx].password = newHash;
                    await fs.writeJson(usersFile, allUsers, { spaces: 2 });
                    logger.info('Migrated password to PBKDF2', { user: user.username });
                }
            }

            const token = createSession(user.id, user.role);
            const responseUser = {
                id: user.id,
                username: user.username,
                role: user.role,
                allowedModels: user.allowedModels
            };
            return res.json({ success: true, user: responseUser, token });
        } else {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (e) {
        logger.error('Login error', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/logout
router.post('/logout', authMiddleware, (req, res) => {
    const token = req.headers.authorization?.slice(7);
    if (token) deleteSession(token);
    res.json({ success: true });
});

// GET /api/session — validate current session
router.get('/session', authMiddleware, (req, res) => {
    res.json({
        valid: true,
        userId: req.sessionUserId,
        role: req.sessionUserRole
    });
});

// DELETE /api/users/:userId — admin only
router.delete('/:userId', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { userId } = req.params;
        if (userId === 'admin') return res.status(400).json({ error: 'Cannot delete root admin' });

        const DATA_DIR = req.app.get('DATA_DIR');
        const usersFile = path.join(DATA_DIR, 'users.json');
        let users = await loadUsers(DATA_DIR);
        users = users.filter(u => u.id !== userId);
        await fs.writeJson(usersFile, users, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
