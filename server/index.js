import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Utils
import logger from './utils/logger.js';
import { initEncryption } from './utils/encryption.js';

// Middleware
import { generalLimiter } from './middleware/rateLimit.js';

// Routes
import filesRouter from './routes/files.js';
import historyRouter from './routes/history.js';
import usersRouter from './routes/users.js';
import settingsRouter from './routes/settings.js';
import cloudJobsRouter from './routes/cloudJobs.js';
import serverKeysRouter from './routes/serverKeys.js';
import { migrateKeysEncryption } from './routes/serverKeys.js';
import userPreferencesRouter from './routes/userPreferences.js';
import presetsRouter from './routes/presets.js';
import galleryRouter from './routes/gallery.js';
import userSettingsRouter from './routes/userSettings.js';

// Emulate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Store DATA_DIR in app for routes to access
app.set('DATA_DIR', DATA_DIR);

// Trust Nginx proxy (needed for rate limiter + correct client IP)
app.set('trust proxy', 1);

// Ensure base data directory exists
fs.ensureDirSync(DATA_DIR);

// ========== Global Middleware ==========

// CORS — only needed in dev (in production, same origin serves everything)
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
    app.use(cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
    }));
}

// Body parsing
app.use(bodyParser.json({ limit: '50mb' }));

// Rate limiting
app.use('/api/', generalLimiter);

// Request logging (simple structured)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        // Only log API requests, skip static files noise
        if (req.originalUrl.startsWith('/api/')) {
            logger.info('request', {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                ms: Date.now() - start
            });
        }
    });
    next();
});

// ========== Routes ==========

// Public routes (no auth)
app.use('/api/files', filesRouter);
app.use('/api/system-settings', settingsRouter);

// Auth routes (login is public, rest needs auth)
app.use('/api/users', usersRouter);
// Login and session are on usersRouter but mounted under /api
app.use('/api', usersRouter);

// Protected routes
app.use('/api', historyRouter);
app.use('/api/cloud-jobs', cloudJobsRouter);
app.use('/api/server-keys', serverKeysRouter);
app.use('/api/user-preferences', userPreferencesRouter);
app.use('/api/settings', userSettingsRouter);
app.use('/api/presets', presetsRouter);
app.use('/api', galleryRouter);

// ========== Static Files (Production) ==========

// Serve built frontend from dist/
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, { index: false }));
    
    // SPA fallback — any non-API route serves index.html
    app.get('/{*splat}', (req, res) => {
        if (!req.path.startsWith('/api/')) {
            res.sendFile(path.join(DIST_DIR, 'index.html'));
        } else {
            res.status(404).json({ error: 'API endpoint not found' });
        }
    });
}

// ========== Startup ==========

// Initialize encryption and migrate keys
initEncryption(DATA_DIR);
migrateKeysEncryption(DATA_DIR).catch(e => logger.error('Key migration error', { error: e.message }));

const server = app.listen(PORT, () => {
    logger.info('Server started', { port: PORT, dataDir: DATA_DIR });
});

// ========== Graceful Shutdown ==========

const gracefulShutdown = (signal) => {
    logger.info('Shutdown signal received', { signal });
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    // Force shutdown after 10s
    setTimeout(() => {
        logger.error('Forced shutdown (timeout)');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
