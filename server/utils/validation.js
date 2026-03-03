import path from 'path';

// Validate userId: alphanumeric, underscore, hyphen only
export const validateUserId = (userId) => {
    if (!userId || typeof userId !== 'string') return false;
    if (userId.length > 50) return false;
    return /^[a-zA-Z0-9_-]+$/.test(userId);
};

// Resolve path safely: ensure it stays within basePath
export const resolveSafePath = (basePath, ...segments) => {
    const fullPath = path.resolve(basePath, ...segments);
    const expectedBase = path.resolve(basePath);
    if (!fullPath.startsWith(expectedBase + path.sep) && fullPath !== expectedBase) {
        return null; // Path traversal detected
    }
    return fullPath;
};

// Get user data directory (validated)
export const getUserDir = (dataDir, userId) => {
    if (!validateUserId(userId)) return null;
    return path.join(dataDir, userId);
};

// Validate save request body
export const validateSaveBody = (body) => {
    if (!body || typeof body !== 'object') return 'Invalid body';
    if (!validateUserId(body.userId)) return 'Invalid userId';
    if (body.prompt && typeof body.prompt === 'string' && body.prompt.length > 200000) return 'Prompt too long';
    if (body.model && typeof body.model === 'string' && body.model.length > 100) return 'Invalid model';
    return null;
};
