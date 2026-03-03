import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';

let sharp = null;

// Lazy-load sharp (may not be installed in all environments)
const getSharp = async () => {
    if (sharp === null) {
        try {
            const module = await import('sharp');
            sharp = module.default;
        } catch {
            sharp = false; // Mark as unavailable
            logger.warn('sharp not installed — thumbnails will not be generated. Run: npm install sharp');
        }
    }
    return sharp || null;
};

const THUMBNAIL_WIDTH = 300;
const PNG_COMPRESSION = 8;

/**
 * Generate a thumbnail from image buffer.
 * Returns the thumbnail buffer, or null on failure.
 */
export const generateThumbnailBuffer = async (imageBuffer) => {
    const sharpLib = await getSharp();
    if (!sharpLib) return null;

    try {
        return await sharpLib(imageBuffer)
            .resize(THUMBNAIL_WIDTH)
            .png({ compressionLevel: PNG_COMPRESSION })
            .toBuffer();
    } catch (e) {
        logger.warn('Thumbnail generation failed', { error: e.message });
        return null;
    }
};

/**
 * Generate and save a thumbnail for a saved image.
 * @param {string} userDir - absolute path to user data directory
 * @param {string} dateStr - date string (e.g., '2026-03-01')
 * @param {string} imageFilename - filename (e.g., '12345_abc.png')
 * @param {Buffer} imageBuffer - the raw image data
 * @returns {string|null} - relative path to thumbnail, or null on failure
 */
export const createThumbnail = async (userDir, dateStr, imageFilename, imageBuffer) => {
    const thumbBuffer = await generateThumbnailBuffer(imageBuffer);
    if (!thumbBuffer) return null;

    try {
        const thumbnailsDir = path.join(userDir, 'thumbnails', dateStr);
        await fs.ensureDir(thumbnailsDir);
        const thumbPath = path.join(thumbnailsDir, imageFilename);
        await fs.writeFile(thumbPath, thumbBuffer);
        return `thumbnails/${dateStr}/${imageFilename}`;
    } catch (e) {
        logger.warn('Thumbnail save failed', { error: e.message });
        return null;
    }
};

/**
 * Ensure a thumbnail exists for an image. If not, generate it on-demand.
 * Like PHP's ensureThumbnail().
 * @param {string} userDir - absolute path to user data directory
 * @param {string} imageRelativePath - e.g., 'images/2026-01-29/filename.png'
 * @returns {string|null} - relative path to thumbnail, or null on failure
 */
export const ensureThumbnail = async (userDir, imageRelativePath) => {
    if (!imageRelativePath) return null;

    // Derive thumbnail path from image path (images/date/file → thumbnails/date/file)
    const parts = imageRelativePath.split('/');
    if (parts.length < 3 || parts[0] !== 'images') return null;

    parts[0] = 'thumbnails';
    const thumbRelativePath = parts.join('/');
    const fullThumbPath = path.join(userDir, thumbRelativePath);

    // Already exists?
    if (await fs.pathExists(fullThumbPath)) {
        return thumbRelativePath;
    }

    // Read original image and generate thumbnail
    const fullImagePath = path.join(userDir, imageRelativePath);
    if (!(await fs.pathExists(fullImagePath))) return null;

    try {
        const imageBuffer = await fs.readFile(fullImagePath);
        const thumbBuffer = await generateThumbnailBuffer(imageBuffer);
        if (!thumbBuffer) return null;

        await fs.ensureDir(path.dirname(fullThumbPath));
        await fs.writeFile(fullThumbPath, thumbBuffer);
        return thumbRelativePath;
    } catch (e) {
        logger.warn('ensureThumbnail failed', { error: e.message, path: imageRelativePath });
        return null;
    }
};
