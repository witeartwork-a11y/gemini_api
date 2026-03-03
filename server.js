
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

// Emulate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');

// ============= 2.6 CORS RESTRICTION =============
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));

// ============= 2.7 RATE LIMITING =============
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts, try again later' },
    standardHeaders: true,
    legacyHeaders: false
});
const keyRevealLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many key reveal requests' }
});
app.use('/api/', generalLimiter);

// Ensure base data directory exists
fs.ensureDirSync(DATA_DIR);

// ============= 2.1 PATH TRAVERSAL PROTECTION =============
const validateUserId = (userId) => {
    if (!userId || typeof userId !== 'string') return false;
    if (userId.length > 50) return false;
    return /^[a-zA-Z0-9_-]+$/.test(userId);
};

const resolveSafePath = (basePath, ...segments) => {
    const fullPath = path.resolve(basePath, ...segments);
    const expectedBase = path.resolve(basePath);
    if (!fullPath.startsWith(expectedBase + path.sep) && fullPath !== expectedBase) {
        return null; // Path traversal detected
    }
    return fullPath;
};

const getUserDir = (userId) => {
    if (!validateUserId(userId)) return null;
    return path.join(DATA_DIR, userId);
};

// ============= 2.2 SESSION MANAGEMENT =============
const activeSessions = new Map(); // token -> { userId, role, expiresAt }
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

const createSession = (userId, role) => {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, {
        userId,
        role,
        expiresAt: Date.now() + SESSION_TTL
    });
    return token;
};

// Clean expired sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of activeSessions) {
        if (session.expiresAt < now) activeSessions.delete(token);
    }
}, 60 * 60 * 1000); // every hour

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const session = activeSessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
        if (session) activeSessions.delete(token);
        return res.status(401).json({ error: 'Session expired' });
    }

    req.sessionUserId = session.userId;
    req.sessionUserRole = session.role;
    next();
};

// Check that authenticated user can access target userId's data
const userAccessMiddleware = (req, res, next) => {
    const targetUserId = req.params.userId || req.body?.userId || req.query?.userId;
    if (!targetUserId) return next(); // No target user - generic route
    if (req.sessionUserRole === 'admin' || req.sessionUserId === targetUserId) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied' });
};

const adminOnly = (req, res, next) => {
    if (req.sessionUserRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// ============= 2.4 PBKDF2 PASSWORD HASHING =============
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const hashPasswordPBKDF2 = async (prehash) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(prehash, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha256', (err, derivedKey) => {
            if (err) reject(err);
            else resolve(`pbkdf2:${salt}:${derivedKey.toString('hex')}`);
        });
    });
};

const verifyPasswordPBKDF2 = (prehash, storedHash) => {
    return new Promise((resolve, reject) => {
        if (!storedHash.startsWith('pbkdf2:')) {
            // Legacy SHA256: direct compare, and signal need for migration
            resolve({ match: prehash === storedHash, needsMigration: true });
            return;
        }
        const parts = storedHash.split(':');
        const salt = parts[1];
        const hash = parts[2];
        crypto.pbkdf2(prehash, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha256', (err, derivedKey) => {
            if (err) reject(err);
            else resolve({ match: derivedKey.toString('hex') === hash, needsMigration: false });
        });
    });
};

// ============= 2.3 API KEY ENCRYPTION =============
const ENCRYPTION_KEY_FILE = path.join(DATA_DIR, '.encryption_key');
let ENCRYPTION_KEY;

const getEncryptionKey = () => {
    if (ENCRYPTION_KEY) return ENCRYPTION_KEY;
    if (process.env.KEY_ENCRYPTION_SECRET) {
        ENCRYPTION_KEY = process.env.KEY_ENCRYPTION_SECRET;
    } else if (fs.pathExistsSync(ENCRYPTION_KEY_FILE)) {
        ENCRYPTION_KEY = fs.readFileSync(ENCRYPTION_KEY_FILE, 'utf-8').trim();
    } else {
        ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(ENCRYPTION_KEY_FILE, ENCRYPTION_KEY);
        console.log('Generated new encryption key, stored in data/.encryption_key');
    }
    return ENCRYPTION_KEY;
};

const encryptApiKey = (plaintext) => {
    const key = Buffer.from(getEncryptionKey(), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return 'enc:' + iv.toString('hex') + ':' + encrypted;
};

const decryptApiKey = (ciphertext) => {
    if (!ciphertext.startsWith('enc:')) return ciphertext; // Not encrypted (legacy)
    const parts = ciphertext.slice(4).split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = Buffer.from(getEncryptionKey(), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
};

// ============= 2.10 KEY ACCESS LOGGING =============
const KEY_ACCESS_LOG = path.join(DATA_DIR, 'key_access_log.json');

const logKeyAccess = async (action, keyId, userId) => {
    try {
        let logs = [];
        if (await fs.pathExists(KEY_ACCESS_LOG)) {
            logs = await fs.readJson(KEY_ACCESS_LOG);
        }
        logs.push({
            action,
            keyId,
            userId,
            timestamp: new Date().toISOString()
        });
        if (logs.length > 1000) logs = logs.slice(-1000);
        await fs.writeJson(KEY_ACCESS_LOG, logs, { spaces: 2 });
    } catch (e) {
        console.error('Key access log error:', e);
    }
};

// ============= 2.9 INPUT VALIDATION =============
const validateSaveBody = (body) => {
    if (!body || typeof body !== 'object') return 'Invalid body';
    if (!validateUserId(body.userId)) return 'Invalid userId';
    if (body.prompt && typeof body.prompt === 'string' && body.prompt.length > 200000) return 'Prompt too long';
    if (body.model && typeof body.model === 'string' && body.model.length > 100) return 'Invalid model';
    return null;
};

const getJobVersion = (job) => {
    const raw = job?.updatedAt ?? job?.timestamp ?? 0;
    const version = Number(raw);
    return Number.isFinite(version) ? version : 0;
};

const normalizeJobStatus = (status) => {
    const text = String(status || '').toUpperCase();
    return text.startsWith('JOB_STATE_') ? text.replace('JOB_STATE_', '') : text;
};

const getJobStatusRank = (status) => {
    const normalized = normalizeJobStatus(status);
    const rankMap = {
        STATE_UNSPECIFIED: 0,
        UNSPECIFIED: 0,
        PENDING: 1,
        RUNNING: 2,
        SUCCEEDED: 4,
        FAILED: 4,
        CANCELLED: 4,
    };
    return rankMap[normalized] ?? 0;
};

const mergeCloudJobs = (existingJobs, incomingJobs) => {
    const merged = new Map();

    for (const job of existingJobs) {
        if (!job?.id) continue;
        merged.set(job.id, job);
    }

    for (const incoming of incomingJobs) {
        if (!incoming?.id) continue;

        const existing = merged.get(incoming.id);
        if (!existing) {
            merged.set(incoming.id, incoming);
            continue;
        }

        const existingVersion = getJobVersion(existing);
        const incomingVersion = getJobVersion(incoming);

        if (incomingVersion > existingVersion) {
            merged.set(incoming.id, { ...existing, ...incoming });
            continue;
        }

        if (incomingVersion < existingVersion) {
            continue;
        }

        const mergedJob = { ...existing, ...incoming };
        if (getJobStatusRank(existing.status) > getJobStatusRank(incoming.status)) {
            mergedJob.status = existing.status;
        }
        if (!mergedJob.outputFileUri) {
            mergedJob.outputFileUri = existing.outputFileUri || incoming.outputFileUri;
        }

        merged.set(incoming.id, mergedJob);
    }

    return Array.from(merged.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
};

// --- Serve Static Files (Optimized Image Delivery) ---
// Public endpoint - no auth required (images are accessed by URL in UI)
app.get(/^\/api\/files\/([^\/]+)\/(.*)$/, (req, res) => {
    const userId = req.params[0];
    const relativePath = req.params[1];
    
    // 2.1: Validate userId
    if (!validateUserId(userId)) {
        return res.status(400).send('Invalid user ID');
    }

    // 2.1: Resolve and validate the full path stays within user directory
    const fullPath = resolveSafePath(DATA_DIR, userId, relativePath);
    if (!fullPath) {
        return res.status(403).send('Access denied');
    }

    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('Not found');
    }
});

// 1. Save Generation
app.post('/api/save', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const validationError = validateSaveBody(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        const { userId, type, model, prompt, image, text, aspectRatio, timestamp, usageMetadata, estimatedCost, inputImageInfo, outputResolution, authorName, workId } = req.body;
        
        const userDir = getUserDir(userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });

        const dateStr = new Date().toISOString().split('T')[0];
        
        // Define paths
        // Images: data/{userId}/images/{date}/
        const imagesDir = path.join(userDir, 'images', dateStr);
        // Logs: data/{userId}/logs/{date}/
        const logsDir = path.join(userDir, 'logs', dateStr);
        
        await fs.ensureDir(imagesDir);
        await fs.ensureDir(logsDir);

        const safeTimestamp = Number(timestamp) || Date.now();
        const id = Math.random().toString(36).substring(2, 9);
        const baseFilename = `${safeTimestamp}_${id}`;
        
        let imageFilename = null;
        let imageSha256 = null;

        // 1. Save Image File (Clean .png only in images folder)
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            imageSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
            imageFilename = `${baseFilename}.png`;
            await fs.writeFile(path.join(imagesDir, imageFilename), buffer);
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

        // 2. Save Metadata File (One JSON per generation)
        const logFilePath = path.join(logsDir, `${baseFilename}.json`);
        
        const metaEntry = {
            id,
            timestamp: safeTimestamp,
            dateStr,
            userId,
            type, // 'single', 'batch', 'cloud'
            model,
            prompt,
            // Store relative path (cross-platform compatible)
            imageRelativePath: imageFilename ? `images/${dateStr}/${imageFilename}` : null,
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
        console.error("Save error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Get History (OPTIMIZED: No fs.readFile for images)
app.get('/api/history/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { date } = req.query; // Optional date filter
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        
        const userDir = getUserDir(userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.json([]);
        }

        let historyItems = [];
        
        // Helper to process a single entry found in a file
        const processEntry = (entry) => {
            if (entry.imageRelativePath) {
                // Construct URL pointing to the new static file endpoint
                entry.imageUrl = `/api/files/${userId}/${entry.imageRelativePath}`;
                delete entry.image; 
            }
            return entry;
        };

        // Get list of all items in logsDir (files or directories)
        const topLevelItems = await fs.readdir(logsDir, { withFileTypes: true });

        // 1. Handle Legacy Daily JSONs (files in logs/)
        const legacyFiles = topLevelItems
            .filter(item => item.isFile() && item.name.endsWith('.json'))
            .filter(item => !date || item.name === `${date}.json`)
            .map(item => path.join(logsDir, item.name));

        for (const logFile of legacyFiles) {
            try {
                const entries = await fs.readJson(logFile);
                if (Array.isArray(entries)) {
                    entries.forEach(e => historyItems.push(processEntry(e)));
                } else {
                    // Single object fallback
                    historyItems.push(processEntry(entries));
                }
            } catch (e) { console.warn(`Error reading legacy log ${logFile}`, e); }
        }

        // 2. Handle New Folder Structure (folders in logs/)
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
                        historyItems.push(processEntry(entry));
                    } catch (e) {
                         console.warn(`Error reading log file ${jsonFile}`, e);
                    }
                }
            } catch (e) { console.warn(`Error reading date folder ${dateFolder}`, e); }
        }
        
        // Sort by timestamp desc
        historyItems.sort((a, b) => b.timestamp - a.timestamp);

        res.json(historyItems);

    } catch (error) {
        console.error("Get history error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Delete History Item
app.delete('/api/history/:userId/:id', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId, id } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const userDir = getUserDir(userId);
        if (!userDir) return res.status(400).json({ error: 'Invalid user ID' });
        const logsDir = path.join(userDir, 'logs');

        if (!fs.existsSync(logsDir)) {
             return res.status(404).json({ error: "No history found" });
        }

        // 1. Try to find in new structure (individual files)
        // We know filename ends in _{id}.json
        const topLevel = await fs.readdir(logsDir, { withFileTypes: true });
        
        // Check Folders first (New Structure)
        const dateFolders = topLevel.filter(d => d.isDirectory());
        
        for (const folder of dateFolders) {
            const folderPath = path.join(logsDir, folder.name);
            const files = await fs.readdir(folderPath);
            const targetFile = files.find(f => f.endsWith(`_${id}.json`));
            
            if (targetFile) {
                const fullPath = path.join(folderPath, targetFile);
                const entry = await fs.readJson(fullPath);
                
                // Delete Image
                if (entry.imageRelativePath) {
                    const imgPath = path.join(userDir, entry.imageRelativePath);
                    await fs.remove(imgPath);
                }
                
                // Delete Meta File
                await fs.remove(fullPath);
                return res.json({ success: true });
            }
        }

        // 2. Check Legacy Daily JSON files
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
                        entries.splice(index, 1);
                        
                        // If empty after delete, remove the daily file? Maybe not to avoid potential issues.
                        await fs.writeJson(logFile, entries, { spaces: 2 });
                        return res.json({ success: true });
                    }
                }
            } catch (e) {}
        }

        res.status(404).json({ error: "Item not found" });

    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Admin Stats
app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
    try {
        const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
        const users = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
        
        const stats = {
            users: {},
            timeline: {}
        };

        for (const userId of users) {
             const logsDir = path.join(DATA_DIR, userId, 'logs');
             if (await fs.pathExists(logsDir)) {
                 stats.users[userId] = { totalTokens: 0, totalCost: 0, count: 0 };
                 
                 const topLevel = await fs.readdir(logsDir, { withFileTypes: true });
                 
                 // Process Legacy Files
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
                     } catch(e) {}
                 }

                 // Process New Folders
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
                             } catch(e) {}
                         }
                     } catch(e) {}
                 }
            }
        }
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. User Persistence
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const normalizeUsersData = (raw) => {
    if (Array.isArray(raw)) {
        return raw.filter(user => user && typeof user === 'object' && user.id && user.username);
    }

    if (raw && typeof raw === 'object' && raw.id && raw.username) {
        return [raw];
    }

    return [];
};

const loadUsers = async () => {
    if (!await fs.pathExists(USERS_FILE)) {
        return [];
    }

    const raw = await fs.readJson(USERS_FILE);
    const users = normalizeUsersData(raw);

    if (!Array.isArray(raw)) {
        await fs.writeJson(USERS_FILE, users, { spaces: 2 });
    }

    return users;
};

const upsertUser = (users, incomingUser) => {
    if (!incomingUser || typeof incomingUser !== 'object' || !incomingUser.id || !incomingUser.username) {
        return users;
    }

    const userIndex = users.findIndex(user => user.id === incomingUser.id);

    if (userIndex === -1) {
        return [...users, incomingUser];
    }

    const mergedUser = { ...users[userIndex], ...incomingUser };
    const updatedUsers = [...users];
    updatedUsers[userIndex] = mergedUser;
    return updatedUsers;
};

// GET /api/users - strip passwords from response; admin-only sees all
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const users = await loadUsers();
        // Never expose password hashes
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

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const incoming = req.body;
        let usersToSave = [];

        if (Array.isArray(incoming)) {
            usersToSave = normalizeUsersData(incoming);
        } else {
            const existingUsers = await loadUsers();
            usersToSave = upsertUser(existingUsers, incoming);
        }

        await fs.writeJson(USERS_FILE, usersToSave, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Login endpoint - no auth required, rate-limited
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const users = await loadUsers();
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Find user with matching username (case-insensitive)
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2.4: PBKDF2 verification with migration
        const result = await verifyPasswordPBKDF2(password, user.password);
        if (result.match) {
            // Migrate legacy SHA256 to PBKDF2 on successful login
            if (result.needsMigration) {
                const newHash = await hashPasswordPBKDF2(password);
                user.password = newHash;
                const allUsers = await loadUsers();
                const idx = allUsers.findIndex(u => u.id === user.id);
                if (idx !== -1) {
                    allUsers[idx].password = newHash;
                    await fs.writeJson(USERS_FILE, allUsers, { spaces: 2 });
                    console.log(`Migrated password for user '${user.username}' to PBKDF2`);
                }
            }

            // 2.2: Create session token
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
        console.error('Login error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Logout endpoint
app.post('/api/logout', authMiddleware, (req, res) => {
    const token = req.headers.authorization?.slice(7);
    if (token) activeSessions.delete(token);
    res.json({ success: true });
});

// Validate session endpoint
app.get('/api/session', authMiddleware, (req, res) => {
    res.json({ 
        valid: true, 
        userId: req.sessionUserId, 
        role: req.sessionUserRole 
    });
});

// Delete user - admin only
app.delete('/api/users/:userId', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { userId } = req.params;
        if (userId === 'admin') return res.status(400).json({ error: 'Cannot delete root admin' });
        
        let users = await loadUsers();
        users = users.filter(u => u.id !== userId);
        await fs.writeJson(USERS_FILE, users, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. System Settings Persistence
const SETTINGS_FILE = path.join(DATA_DIR, 'system_settings.json');

// GET system settings - public (language/theme needed before login)
app.get('/api/system-settings', async (req, res) => {
    try {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const settings = await fs.readJson(SETTINGS_FILE);
            res.json(settings);
        } else {
            res.json(null);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/system-settings', authMiddleware, adminOnly, async (req, res) => {
    try {
        const settings = req.body;
        await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Cloud Jobs Persistence
app.get('/api/cloud-jobs/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const userDir = getUserDir(userId);
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

app.post('/api/cloud-jobs/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const incomingJobs = Array.isArray(req.body) ? req.body : [];
        const userDir = getUserDir(userId);
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

// ============= SERVER API KEYS =============

const SERVER_KEYS_FILE = path.join(DATA_DIR, 'server_api_keys.json');

const loadServerKeys = async () => {
    if (await fs.pathExists(SERVER_KEYS_FILE)) {
        return await fs.readJson(SERVER_KEYS_FILE);
    }
    return [];
};

const saveServerKeys = async (keys) => {
    await fs.writeJson(SERVER_KEYS_FILE, keys, { spaces: 2 });
};

const maskApiKey = (rawKey) => {
    // Decrypt first if encrypted, then mask
    const key = rawKey?.startsWith('enc:') ? '(encrypted)' : rawKey;
    if (!key || key.length <= 8) return '****' + (key ? key.slice(-2) : '');
    return '****' + key.slice(-4);
};

// Migrate unencrypted keys to encrypted on load
const migrateKeysEncryption = async () => {
    const keys = await loadServerKeys();
    let changed = false;
    for (const k of keys) {
        if (k.key && !k.key.startsWith('enc:')) {
            k.key = encryptApiKey(k.key);
            changed = true;
        }
    }
    if (changed) {
        await saveServerKeys(keys);
        console.log('Migrated API keys to encrypted storage');
    }
};

// GET /api/server-keys - List keys (filtered by user access)
app.get('/api/server-keys', authMiddleware, async (req, res) => {
    try {
        const keys = await loadServerKeys();
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

// POST /api/server-keys - Create or update a key (admin only)
app.post('/api/server-keys', authMiddleware, adminOnly, async (req, res) => {
    try {
        const data = req.body;
        if (!data.provider || !data.label) {
            return res.status(400).json({ error: 'Provider and label are required' });
        }

        const keys = await loadServerKeys();

        if (data.id) {
            // Update existing
            const idx = keys.findIndex(k => k.id === data.id);
            if (idx === -1) return res.status(404).json({ error: 'Key not found' });
            keys[idx].provider = data.provider;
            keys[idx].label = data.label;
            if (data.key) keys[idx].key = encryptApiKey(data.key);
            if (data.enabled !== undefined) keys[idx].enabled = !!data.enabled;
            if (data.allowedUsers) keys[idx].allowedUsers = data.allowedUsers;
            await logKeyAccess('update', data.id, req.sessionUserId);
        } else {
            // Create new
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
            await logKeyAccess('create', newId, req.sessionUserId);
        }

        await saveServerKeys(keys);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/server-keys/:id - Delete a key (admin only)
app.delete('/api/server-keys/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        let keys = await loadServerKeys();
        const keyId = req.params.id;
        keys = keys.filter(k => k.id !== keyId);
        await saveServerKeys(keys);
        await logKeyAccess('delete', keyId, req.sessionUserId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/server-keys/:id/toggle - Toggle enabled/disabled (admin only)
app.post('/api/server-keys/:id/toggle', authMiddleware, adminOnly, async (req, res) => {
    try {
        const keys = await loadServerKeys();
        const key = keys.find(k => k.id === req.params.id);
        if (!key) return res.status(404).json({ error: 'Key not found' });
        key.enabled = !key.enabled;
        await saveServerKeys(keys);
        await logKeyAccess('toggle', req.params.id, req.sessionUserId);
        res.json({ success: true, enabled: key.enabled });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/server-keys/:id/reveal - Get actual key value (authorized users)
app.get('/api/server-keys/:id/reveal', authMiddleware, keyRevealLimiter, async (req, res) => {
    try {
        const keys = await loadServerKeys();
        const key = keys.find(k => k.id === req.params.id);
        if (!key) return res.status(404).json({ error: 'Key not found' });
        if (!key.enabled) return res.status(403).json({ error: 'Key is disabled' });

        const isAdmin = req.sessionUserRole === 'admin';
        const hasAccess = (key.allowedUsers || []).includes('all') || (key.allowedUsers || []).includes(req.sessionUserId);
        if (!isAdmin && !hasAccess) return res.status(403).json({ error: 'Access denied' });

        await logKeyAccess('reveal', req.params.id, req.sessionUserId);
        
        // Decrypt key before sending
        const decryptedKey = decryptApiKey(key.key);
        res.json({ key: decryptedKey, provider: key.provider });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============= USER PREFERENCES =============
app.get('/api/user-preferences/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const prefsFile = path.join(DATA_DIR, userId, 'preferences.json');
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

app.post('/api/user-preferences/:userId', authMiddleware, userAccessMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!validateUserId(userId)) return res.status(400).json({ error: 'Invalid user ID' });
        const userDir = path.join(DATA_DIR, userId);
        await fs.ensureDir(userDir);
        const prefsFile = path.join(userDir, 'preferences.json');
        await fs.writeJson(prefsFile, req.body, { spaces: 2 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============= STARTUP =============

// Migrate existing API keys to encrypted storage
migrateKeysEncryption().catch(e => console.error('Key migration error:', e));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data stored in ${DATA_DIR}`);
});