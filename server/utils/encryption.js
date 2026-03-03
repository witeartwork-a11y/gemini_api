import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';

const ENCRYPTION_KEY_FILE_NAME = '.encryption_key';
let ENCRYPTION_KEY = null;

export const initEncryption = (dataDir) => {
    const keyFile = path.join(dataDir, ENCRYPTION_KEY_FILE_NAME);

    if (process.env.KEY_ENCRYPTION_SECRET) {
        ENCRYPTION_KEY = process.env.KEY_ENCRYPTION_SECRET;
    } else if (fs.pathExistsSync(keyFile)) {
        ENCRYPTION_KEY = fs.readFileSync(keyFile, 'utf-8').trim();
    } else {
        ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(keyFile, ENCRYPTION_KEY);
        logger.info('Generated new encryption key', { file: ENCRYPTION_KEY_FILE_NAME });
    }
};

const getEncryptionKey = () => {
    if (!ENCRYPTION_KEY) throw new Error('Encryption not initialized. Call initEncryption() first.');
    return ENCRYPTION_KEY;
};

export const encryptApiKey = (plaintext) => {
    const key = Buffer.from(getEncryptionKey(), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return 'enc:' + iv.toString('hex') + ':' + encrypted;
};

export const decryptApiKey = (ciphertext) => {
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
