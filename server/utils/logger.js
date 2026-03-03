// Structured JSON logger for consistent output
const logger = {
    info: (msg, meta = {}) => console.log(JSON.stringify({
        level: 'info', msg, ...meta, time: new Date().toISOString()
    })),
    warn: (msg, meta = {}) => console.warn(JSON.stringify({
        level: 'warn', msg, ...meta, time: new Date().toISOString()
    })),
    error: (msg, meta = {}) => console.error(JSON.stringify({
        level: 'error', msg, ...meta, time: new Date().toISOString()
    })),
};

export default logger;
