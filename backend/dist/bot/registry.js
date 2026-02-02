/**
 * POKERGODS Bot Arena - Bot Registry
 * Manages bot registrations, stats, and sessions
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateApiKey, revokeAllKeysForBot } from './apiKeys.js';
const DATA_DIR = path.join(process.cwd(), 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
// In-memory stores
const bots = new Map();
const sessions = new Map();
const botNameIndex = new Map(); // name -> botId
// ============== Bot Registration ==============
/**
 * Register a new bot
 * Returns the bot record and the raw API key (shown only once)
 */
export function registerBot(name, ownerId) {
    // Validate name
    const cleanName = name.trim();
    if (cleanName.length < 3 || cleanName.length > 32) {
        return { error: 'Bot name must be 3-32 characters' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
        return { error: 'Bot name can only contain letters, numbers, _ and -' };
    }
    // Check for duplicate name
    if (botNameIndex.has(cleanName.toLowerCase())) {
        return { error: 'Bot name already taken' };
    }
    const botId = randomUUID();
    const stats = {
        matchesPlayed: 0,
        matchesWon: 0,
        handsPlayed: 0,
        totalWinnings: 0,
        elo: 1500,
        bestFinish: 0,
    };
    // Generate API key
    const { rawKey, record: keyRecord } = generateApiKey(botId, ownerId, ['play']);
    const bot = {
        botId,
        name: cleanName,
        ownerId,
        apiKey: keyRecord.keyHash, // Store hash reference
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        stats,
        status: 'active',
    };
    bots.set(botId, bot);
    botNameIndex.set(cleanName.toLowerCase(), botId);
    persistBotsDebounced();
    return { bot, apiKey: rawKey };
}
/**
 * Get a bot by ID
 */
export function getBot(botId) {
    return bots.get(botId) ?? null;
}
/**
 * Get a bot by name
 */
export function getBotByName(name) {
    const botId = botNameIndex.get(name.toLowerCase());
    return botId ? bots.get(botId) ?? null : null;
}
/**
 * List all bots
 */
export function listBots(options) {
    let result = Array.from(bots.values());
    // Filter
    if (options?.status) {
        result = result.filter(b => b.status === options.status);
    }
    if (options?.ownerId) {
        result = result.filter(b => b.ownerId === options.ownerId);
    }
    // Sort
    const sortBy = options?.sortBy ?? 'elo';
    result.sort((a, b) => {
        switch (sortBy) {
            case 'elo': return b.stats.elo - a.stats.elo;
            case 'wins': return b.stats.matchesWon - a.stats.matchesWon;
            case 'created': return b.createdAt - a.createdAt;
            case 'active': return b.lastActiveAt - a.lastActiveAt;
            default: return 0;
        }
    });
    // Limit
    if (options?.limit) {
        result = result.slice(0, options.limit);
    }
    return result;
}
/**
 * Update bot status
 */
export function updateBotStatus(botId, status) {
    const bot = bots.get(botId);
    if (!bot)
        return false;
    bot.status = status;
    persistBotsDebounced();
    return true;
}
/**
 * Delete a bot (and revoke all its keys)
 */
export function deleteBot(botId) {
    const bot = bots.get(botId);
    if (!bot)
        return false;
    bots.delete(botId);
    botNameIndex.delete(bot.name.toLowerCase());
    revokeAllKeysForBot(botId);
    persistBotsDebounced();
    return true;
}
// ============== Stats Updates ==============
/**
 * Update bot stats after a match
 */
export function updateBotStats(botId, update) {
    const bot = bots.get(botId);
    if (!bot)
        return;
    bot.stats.matchesPlayed++;
    if (update.won)
        bot.stats.matchesWon++;
    bot.stats.handsPlayed += update.handsPlayed;
    bot.stats.totalWinnings += update.chipsWon;
    bot.stats.elo = Math.max(100, bot.stats.elo + update.eloChange);
    if (update.placement && (!bot.stats.bestFinish || update.placement < bot.stats.bestFinish)) {
        bot.stats.bestFinish = update.placement;
    }
    bot.lastActiveAt = Date.now();
    persistBotsDebounced();
}
/**
 * Get ELO for a bot
 */
export function getBotElo(botId) {
    return bots.get(botId)?.stats.elo ?? 1500;
}
/**
 * Set ELO for a bot
 */
export function setBotElo(botId, elo) {
    const bot = bots.get(botId);
    if (bot) {
        bot.stats.elo = Math.round(Math.max(100, elo));
        persistBotsDebounced();
    }
}
// ============== Sessions ==============
/**
 * Create a new session for a bot
 */
export function createSession(botId) {
    const session = {
        sessionId: randomUUID(),
        botId,
        connectedAt: Date.now(),
        lastPingAt: Date.now(),
        currentTableId: null,
        currentTournamentId: null,
    };
    sessions.set(session.sessionId, session);
    // Update bot's last active time
    const bot = bots.get(botId);
    if (bot) {
        bot.lastActiveAt = Date.now();
        persistBotsDebounced();
    }
    return session;
}
/**
 * Get a session by ID
 */
export function getSession(sessionId) {
    return sessions.get(sessionId) ?? null;
}
/**
 * Get session by bot ID (if connected)
 */
export function getSessionByBotId(botId) {
    for (const session of sessions.values()) {
        if (session.botId === botId)
            return session;
    }
    return null;
}
/**
 * Update session ping time
 */
export function pingSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session)
        return false;
    session.lastPingAt = Date.now();
    return true;
}
/**
 * Set session's current table
 */
export function setSessionTable(sessionId, tableId) {
    const session = sessions.get(sessionId);
    if (session) {
        session.currentTableId = tableId;
    }
}
/**
 * End a session
 */
export function endSession(sessionId) {
    sessions.delete(sessionId);
}
/**
 * Get all active sessions
 */
export function getActiveSessions() {
    return Array.from(sessions.values());
}
/**
 * Get count of connected bots
 */
export function getConnectedBotCount() {
    return sessions.size;
}
/**
 * Clean up stale sessions (no ping in 60s)
 */
export function cleanupStaleSessions() {
    const now = Date.now();
    const staleThreshold = 60_000; // 60 seconds
    let cleaned = 0;
    for (const [sessionId, session] of sessions) {
        if (now - session.lastPingAt > staleThreshold) {
            sessions.delete(sessionId);
            cleaned++;
        }
    }
    return cleaned;
}
// ============== Leaderboard ==============
/**
 * Get top bots by ELO
 */
export function getLeaderboard(limit = 50) {
    const sorted = Array.from(bots.values())
        .filter(b => b.status === 'active')
        .sort((a, b) => b.stats.elo - a.stats.elo)
        .slice(0, limit);
    return sorted.map((bot, index) => ({
        rank: index + 1,
        botId: bot.botId,
        name: bot.name,
        elo: bot.stats.elo,
        wins: bot.stats.matchesWon,
        matches: bot.stats.matchesPlayed,
        winRate: bot.stats.matchesPlayed > 0
            ? Math.round((bot.stats.matchesWon / bot.stats.matchesPlayed) * 100)
            : 0,
    }));
}
// ============== Persistence ==============
let persistTimer = null;
function persistBotsDebounced() {
    if (persistTimer)
        clearTimeout(persistTimer);
    persistTimer = setTimeout(persistBots, 500);
}
async function persistBots() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const data = {};
        bots.forEach((v, k) => { data[k] = v; });
        await fs.writeFile(BOTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('[registry] persist error:', e);
    }
}
export async function loadBots() {
    try {
        const raw = await fs.readFile(BOTS_FILE, 'utf-8');
        const data = JSON.parse(raw || '{}');
        for (const [botId, bot] of Object.entries(data)) {
            if (isValidBot(bot)) {
                bots.set(botId, bot);
                botNameIndex.set(bot.name.toLowerCase(), botId);
            }
        }
        console.log(`[registry] loaded ${bots.size} bots`);
    }
    catch (e) {
        console.log('[registry] no existing bots file, starting fresh');
    }
}
function isValidBot(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const b = obj;
    return (typeof b.botId === 'string' &&
        typeof b.name === 'string' &&
        typeof b.ownerId === 'string' &&
        typeof b.createdAt === 'number');
}
// ============== Initialization ==============
// Clean up stale sessions every 30 seconds
setInterval(() => {
    const cleaned = cleanupStaleSessions();
    if (cleaned > 0) {
        console.log(`[registry] cleaned ${cleaned} stale sessions`);
    }
}, 30_000);
//# sourceMappingURL=registry.js.map