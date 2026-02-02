/**
 * POKERGODS Bot Arena - API Key Management
 * Handles bot authentication via API keys
 */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const DATA_DIR = path.join(process.cwd(), 'data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');
// In-memory store (persisted to disk)
const apiKeys = new Map();
// ============== Key Generation ==============
/**
 * Generate a new API key for a bot
 * Returns the raw key (only shown once) and the record
 */
export function generateApiKey(botId, ownerId, permissions = ['play']) {
    // Generate 32 random bytes, encode as base64url
    const rawKey = `pgbot_${randomBytes(32).toString('base64url')}`;
    const keyHash = hashKey(rawKey);
    const record = {
        keyHash,
        botId,
        ownerId,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        permissions,
    };
    apiKeys.set(keyHash, record);
    persistApiKeysDebounced();
    return { rawKey, record };
}
/**
 * Hash an API key for storage/lookup
 */
export function hashKey(rawKey) {
    return createHash('sha256').update(rawKey).digest('hex');
}
// ============== Validation ==============
/**
 * Validate an API key and return the associated record
 */
export function validateApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string')
        return null;
    // Handle "Bearer " prefix if present
    const key = rawKey.startsWith('Bearer ') ? rawKey.slice(7) : rawKey;
    // Must start with prefix
    if (!key.startsWith('pgbot_'))
        return null;
    const keyHash = hashKey(key);
    const record = apiKeys.get(keyHash);
    if (!record)
        return null;
    // Update last used timestamp
    record.lastUsedAt = Date.now();
    persistApiKeysDebounced();
    return record;
}
/**
 * Check if a key has a specific permission
 */
export function hasPermission(rawKey, permission) {
    const record = validateApiKey(rawKey);
    if (!record)
        return false;
    return record.permissions.includes(permission);
}
/**
 * Get bot ID from API key
 */
export function getBotIdFromKey(rawKey) {
    const record = validateApiKey(rawKey);
    return record?.botId ?? null;
}
// ============== Management ==============
/**
 * Revoke an API key
 */
export function revokeApiKey(keyHash) {
    const deleted = apiKeys.delete(keyHash);
    if (deleted)
        persistApiKeysDebounced();
    return deleted;
}
/**
 * Revoke all keys for a bot
 */
export function revokeAllKeysForBot(botId) {
    let count = 0;
    for (const [hash, record] of apiKeys) {
        if (record.botId === botId) {
            apiKeys.delete(hash);
            count++;
        }
    }
    if (count > 0)
        persistApiKeysDebounced();
    return count;
}
/**
 * List all keys for a bot (returns records, not raw keys)
 */
export function listKeysForBot(botId) {
    const keys = [];
    for (const record of apiKeys.values()) {
        if (record.botId === botId) {
            keys.push(record);
        }
    }
    return keys;
}
/**
 * Get stats about API keys
 */
export function getApiKeyStats() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    let activeToday = 0;
    const byBot = new Map();
    for (const record of apiKeys.values()) {
        if (record.lastUsedAt > oneDayAgo)
            activeToday++;
        byBot.set(record.botId, (byBot.get(record.botId) ?? 0) + 1);
    }
    return {
        totalKeys: apiKeys.size,
        activeToday,
        byBot,
    };
}
// ============== Persistence ==============
let persistTimer = null;
function persistApiKeysDebounced() {
    if (persistTimer)
        clearTimeout(persistTimer);
    persistTimer = setTimeout(persistApiKeys, 500);
}
async function persistApiKeys() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const data = {};
        apiKeys.forEach((v, k) => { data[k] = v; });
        await fs.writeFile(API_KEYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('[apiKeys] persist error:', e);
    }
}
export async function loadApiKeys() {
    try {
        const raw = await fs.readFile(API_KEYS_FILE, 'utf-8');
        const data = JSON.parse(raw || '{}');
        for (const [hash, record] of Object.entries(data)) {
            if (isValidRecord(record)) {
                apiKeys.set(hash, record);
            }
        }
        console.log(`[apiKeys] loaded ${apiKeys.size} keys`);
    }
    catch (e) {
        // File doesn't exist yet, that's fine
        console.log('[apiKeys] no existing keys file, starting fresh');
    }
}
function isValidRecord(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const r = obj;
    return (typeof r.keyHash === 'string' &&
        typeof r.botId === 'string' &&
        typeof r.ownerId === 'string' &&
        typeof r.createdAt === 'number' &&
        Array.isArray(r.permissions));
}
/**
 * Express middleware to require bot authentication
 */
export function requireBotAuth(req, res, next) {
    const authHeader = req.headers.authorization ?? '';
    const apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.query.apiKey;
    if (!apiKey) {
        res.status(401).json({ ok: false, error: 'API key required' });
        return;
    }
    const record = validateApiKey(apiKey);
    if (!record) {
        res.status(401).json({ ok: false, error: 'Invalid API key' });
        return;
    }
    // Attach bot info to request
    ;
    req.botId = record.botId;
    req.botOwnerId = record.ownerId;
    req.botPermissions = record.permissions;
    next();
}
/**
 * Middleware to require specific permission
 */
export function requirePermission(permission) {
    return (req, res, next) => {
        const permissions = req.botPermissions;
        if (!permissions || !permissions.includes(permission)) {
            res.status(403).json({
                ok: false,
                error: `Permission '${permission}' required`
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=apiKeys.js.map