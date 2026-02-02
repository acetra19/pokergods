/**
 * POKERGODS Bot Arena - API Routes
 * Express routes for bot management
 */
import { Router } from 'express';
import { registerBot, getBot, getBotByName, listBots, updateBotStatus, deleteBot, getLeaderboard, requireBotAuth, generateApiKey, listKeysForBot, revokeApiKey, getConnectedBotCount, getConnectedBotIds, isBotConnected, } from './index.js';
import { createTournament, registerForTournament, unregisterFromTournament, getTournament, getUpcomingTournaments, getActiveTournaments, getRecentResults, } from './tournament.js';
import { createCashTable, getCashTable, listCashTables, joinCashTable, leaveCashTable, getTableSpectatorView, claimDailyChips, getDailyClaimStatus, getArenaStats, STAKES, } from './cashgames.js';
export const botRouter = Router();
// ============== Bot Registration ==============
/**
 * POST /api/v1/bot/register
 * Register a new bot
 */
botRouter.post('/register', (req, res) => {
    try {
        const { name, ownerId } = req.body || {};
        if (!name || typeof name !== 'string') {
            res.status(400).json({ ok: false, error: 'Bot name required' });
            return;
        }
        if (!ownerId || typeof ownerId !== 'string') {
            res.status(400).json({ ok: false, error: 'Owner ID (wallet) required' });
            return;
        }
        const result = registerBot(name, ownerId);
        if ('error' in result) {
            res.status(400).json({ ok: false, error: result.error });
            return;
        }
        res.json({
            ok: true,
            bot: {
                botId: result.bot.botId,
                name: result.bot.name,
                ownerId: result.bot.ownerId,
                createdAt: result.bot.createdAt,
                stats: result.bot.stats,
            },
            apiKey: result.apiKey, // Only shown once!
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/bot/:botId
 * Get bot info
 */
botRouter.get('/:botId', (req, res) => {
    try {
        const botId = req.params.botId ?? '';
        if (!botId) {
            res.status(400).json({ ok: false, error: 'Bot ID required' });
            return;
        }
        const bot = getBot(botId);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        res.json({
            ok: true,
            bot: {
                botId: bot.botId,
                name: bot.name,
                status: bot.status,
                createdAt: bot.createdAt,
                lastActiveAt: bot.lastActiveAt,
                stats: bot.stats,
                isConnected: isBotConnected(bot.botId),
            },
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/bot/name/:name
 * Get bot by name
 */
botRouter.get('/name/:name', (req, res) => {
    try {
        const name = req.params.name ?? '';
        if (!name) {
            res.status(400).json({ ok: false, error: 'Name required' });
            return;
        }
        const bot = getBotByName(name);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        res.json({
            ok: true,
            bot: {
                botId: bot.botId,
                name: bot.name,
                status: bot.status,
                stats: bot.stats,
                isConnected: isBotConnected(bot.botId),
            },
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/bots
 * List all bots
 */
botRouter.get('/', (req, res) => {
    try {
        const status = req.query.status || undefined;
        const ownerId = req.query.ownerId || undefined;
        const limit = parseInt(req.query.limit) || 50;
        const sortBy = req.query.sortBy || 'elo';
        const opts = { limit, sortBy };
        if (status)
            opts.status = status;
        if (ownerId)
            opts.ownerId = ownerId;
        const bots = listBots(opts);
        res.json({
            ok: true,
            bots: bots.map(b => ({
                botId: b.botId,
                name: b.name,
                status: b.status,
                stats: b.stats,
                isConnected: isBotConnected(b.botId),
            })),
            total: bots.length,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * DELETE /api/v1/bot/:botId
 * Delete a bot (requires owner auth)
 */
botRouter.delete('/:botId', requireBotAuth, (req, res) => {
    try {
        const botId = req.params.botId ?? '';
        if (!botId) {
            res.status(400).json({ ok: false, error: 'Bot ID required' });
            return;
        }
        const bot = getBot(botId);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        // Only owner can delete
        if (bot.ownerId !== req.botOwnerId) {
            res.status(403).json({ ok: false, error: 'Not authorized' });
            return;
        }
        deleteBot(botId);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== API Keys ==============
/**
 * POST /api/v1/bot/:botId/key
 * Generate new API key for a bot
 */
botRouter.post('/:botId/key', requireBotAuth, (req, res) => {
    try {
        const botId = req.params.botId ?? '';
        if (!botId) {
            res.status(400).json({ ok: false, error: 'Bot ID required' });
            return;
        }
        const bot = getBot(botId);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        // Only owner can create keys
        if (bot.ownerId !== req.botOwnerId) {
            res.status(403).json({ ok: false, error: 'Not authorized' });
            return;
        }
        const { rawKey, record } = generateApiKey(botId, bot.ownerId);
        res.json({
            ok: true,
            apiKey: rawKey, // Only shown once!
            keyHash: record.keyHash,
            createdAt: record.createdAt,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/bot/:botId/keys
 * List API keys for a bot (returns hashes only)
 */
botRouter.get('/:botId/keys', requireBotAuth, (req, res) => {
    try {
        const botId = req.params.botId ?? '';
        if (!botId) {
            res.status(400).json({ ok: false, error: 'Bot ID required' });
            return;
        }
        const bot = getBot(botId);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        // Only owner can list keys
        if (bot.ownerId !== req.botOwnerId) {
            res.status(403).json({ ok: false, error: 'Not authorized' });
            return;
        }
        const keys = listKeysForBot(botId);
        res.json({
            ok: true,
            keys: keys.map(k => ({
                keyHash: k.keyHash.slice(0, 8) + '...', // Truncated for security
                createdAt: k.createdAt,
                lastUsedAt: k.lastUsedAt,
                permissions: k.permissions,
            })),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * DELETE /api/v1/bot/:botId/key/:keyHash
 * Revoke an API key
 */
botRouter.delete('/:botId/key/:keyHash', requireBotAuth, (req, res) => {
    try {
        const botId = req.params.botId ?? '';
        const keyHash = req.params.keyHash ?? '';
        if (!botId || !keyHash) {
            res.status(400).json({ ok: false, error: 'Bot ID and key hash required' });
            return;
        }
        const bot = getBot(botId);
        if (!bot) {
            res.status(404).json({ ok: false, error: 'Bot not found' });
            return;
        }
        // Only owner can revoke keys
        if (bot.ownerId !== req.botOwnerId) {
            res.status(403).json({ ok: false, error: 'Not authorized' });
            return;
        }
        const revoked = revokeApiKey(keyHash);
        res.json({ ok: true, revoked });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Leaderboard ==============
/**
 * GET /api/v1/leaderboard
 * Get bot leaderboard
 */
botRouter.get('/leaderboard', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboard = getLeaderboard(limit);
        res.json({
            ok: true,
            leaderboard,
            connectedBots: getConnectedBotCount(),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Tournaments ==============
/**
 * GET /api/v1/tournaments
 * Get upcoming and active tournaments
 */
botRouter.get('/tournaments', (req, res) => {
    try {
        const upcoming = getUpcomingTournaments();
        const active = getActiveTournaments();
        res.json({
            ok: true,
            upcoming: upcoming.map(t => ({
                tournamentId: t.tournamentId,
                name: t.name,
                startTime: t.startTime,
                registrationDeadline: t.registrationDeadline,
                status: t.status,
                prizePool: t.prizePool,
                playerCount: t.registeredBots.length,
                maxPlayers: t.maxPlayers,
            })),
            active: active.map(t => ({
                tournamentId: t.tournamentId,
                name: t.name,
                status: t.status,
                playerCount: t.registeredBots.length,
                currentLevel: t.currentLevel,
            })),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/tournament/:id
 * Get tournament details
 */
botRouter.get('/tournament/:id', (req, res) => {
    try {
        const id = req.params.id ?? '';
        if (!id) {
            res.status(400).json({ ok: false, error: 'Tournament ID required' });
            return;
        }
        const tournament = getTournament(id);
        if (!tournament) {
            res.status(404).json({ ok: false, error: 'Tournament not found' });
            return;
        }
        res.json({
            ok: true,
            tournament: {
                ...tournament,
                registeredBots: tournament.registeredBots.map(botId => {
                    const bot = getBot(botId);
                    return { botId, name: bot?.name ?? 'Unknown', elo: bot?.stats.elo ?? 1500 };
                }),
            },
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/v1/tournament/:id/register
 * Register for a tournament (requires bot auth)
 */
botRouter.post('/tournament/:id/register', requireBotAuth, (req, res) => {
    try {
        const tournamentId = req.params.id ?? '';
        const botId = req.botId;
        if (!tournamentId) {
            res.status(400).json({ ok: false, error: 'Tournament ID required' });
            return;
        }
        const result = registerForTournament(tournamentId, botId);
        if (!result.ok) {
            res.status(400).json(result);
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/v1/tournament/:id/unregister
 * Unregister from a tournament (requires bot auth)
 */
botRouter.post('/tournament/:id/unregister', requireBotAuth, (req, res) => {
    try {
        const tournamentId = req.params.id ?? '';
        const botId = req.botId;
        if (!tournamentId) {
            res.status(400).json({ ok: false, error: 'Tournament ID required' });
            return;
        }
        const result = unregisterFromTournament(tournamentId, botId);
        if (!result.ok) {
            res.status(400).json(result);
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/tournaments/results
 * Get recent tournament results
 */
botRouter.get('/tournaments/results', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const results = getRecentResults(limit);
        res.json({
            ok: true,
            results: results.map(r => {
                const tournament = getTournament(r.tournamentId);
                return {
                    tournamentId: r.tournamentId,
                    name: tournament?.name ?? 'Unknown',
                    placements: r.placements,
                    duration: r.duration,
                };
            }),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Status ==============
/**
 * GET /api/v1/status
 * Get arena status
 */
botRouter.get('/status', (req, res) => {
    try {
        const connectedBots = getConnectedBotIds();
        const upcoming = getUpcomingTournaments();
        const active = getActiveTournaments();
        res.json({
            ok: true,
            status: {
                connectedBots: connectedBots.length,
                upcomingTournaments: upcoming.length,
                activeTournaments: active.length,
                nextTournament: upcoming[0] ? {
                    name: upcoming[0].name,
                    startTime: upcoming[0].startTime,
                    registered: upcoming[0].registeredBots.length,
                } : null,
            },
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Arena Stats ==============
/**
 * GET /api/v1/arena/stats
 * Get arena statistics (public)
 */
botRouter.get('/arena/stats', (req, res) => {
    try {
        const stats = getArenaStats();
        res.json({ ok: true, stats });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Cash Games ==============
/**
 * GET /api/v1/tables
 * List all cash game tables
 */
botRouter.get('/tables', (req, res) => {
    try {
        const stakesParam = req.query.stakes;
        const hasSeats = req.query.hasSeats === 'true';
        const opts = {};
        if (stakesParam && ['micro', 'low', 'mid', 'high', 'nosebleed'].includes(stakesParam)) {
            opts.stakes = stakesParam;
        }
        if (hasSeats)
            opts.hasSeats = true;
        const tables = listCashTables(opts);
        res.json({
            ok: true,
            tables: tables.map(t => ({
                tableId: t.tableId,
                name: t.name,
                stakes: t.stakes,
                stakesName: STAKES[t.stakes].name,
                smallBlind: t.smallBlind,
                bigBlind: t.bigBlind,
                minBuyIn: t.minBuyIn,
                maxBuyIn: t.maxBuyIn,
                maxPlayers: t.maxPlayers,
                playerCount: t.players.length,
                status: t.status,
                players: t.players.map(p => ({
                    botId: p.botId,
                    botName: p.botName,
                    seat: p.seat,
                    chips: p.chips,
                })),
            })),
            stakes: STAKES,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * GET /api/v1/tables/:tableId
 * Get table details (spectator view)
 */
botRouter.get('/tables/:tableId', (req, res) => {
    try {
        const tableId = req.params.tableId ?? '';
        if (!tableId) {
            res.status(400).json({ ok: false, error: 'Table ID required' });
            return;
        }
        const table = getTableSpectatorView(tableId);
        if (!table) {
            res.status(404).json({ ok: false, error: 'Table not found' });
            return;
        }
        res.json({ ok: true, table });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/v1/tables/:tableId/join
 * Join a cash game table (requires bot auth)
 */
botRouter.post('/tables/:tableId/join', requireBotAuth, (req, res) => {
    try {
        const tableId = req.params.tableId ?? '';
        const botId = req.botId;
        const buyIn = req.body?.buyIn ?? 0;
        if (!tableId) {
            res.status(400).json({ ok: false, error: 'Table ID required' });
            return;
        }
        if (!buyIn || buyIn <= 0) {
            res.status(400).json({ ok: false, error: 'Buy-in amount required' });
            return;
        }
        const result = joinCashTable(tableId, botId, buyIn);
        if (!result.ok) {
            res.status(400).json(result);
            return;
        }
        res.json({
            ok: true,
            seat: result.seat,
            message: `Joined table at seat ${result.seat}`,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/v1/tables/:tableId/leave
 * Leave a cash game table (requires bot auth)
 */
botRouter.post('/tables/:tableId/leave', requireBotAuth, (req, res) => {
    try {
        const tableId = req.params.tableId ?? '';
        const botId = req.botId;
        if (!tableId) {
            res.status(400).json({ ok: false, error: 'Table ID required' });
            return;
        }
        const result = leaveCashTable(tableId, botId);
        if (!result.ok) {
            res.status(400).json(result);
            return;
        }
        res.json({
            ok: true,
            cashOut: result.cashOut,
            message: `Left table with ${result.cashOut} chips`,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
// ============== Daily Chips ==============
/**
 * GET /api/v1/daily
 * Check daily chips claim status (requires bot auth)
 */
botRouter.get('/daily', requireBotAuth, (req, res) => {
    try {
        const botId = req.botId;
        const status = getDailyClaimStatus(botId);
        res.json({ ok: true, ...status });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/v1/daily
 * Claim daily chips (requires bot auth)
 */
botRouter.post('/daily', requireBotAuth, (req, res) => {
    try {
        const botId = req.botId;
        const result = claimDailyChips(botId);
        if (!result.ok) {
            res.status(400).json(result);
            return;
        }
        res.json({
            ok: true,
            chips: result.chips,
            nextClaimAt: result.nextClaimAt,
            message: `Claimed ${result.chips} daily chips!`,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
//# sourceMappingURL=routes.js.map