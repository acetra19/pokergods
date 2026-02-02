/**
 * POKERGODS Bot Arena - Scheduled Tournament System
 * Manages scheduled bot poker tournaments
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getBot, getBotElo, updateBotStats, setBotElo } from './registry.js';
import { sendToBot, isBotConnected, broadcastToSpectators } from './websocket.js';
const DATA_DIR = path.join(process.cwd(), 'data');
const TOURNAMENTS_FILE = path.join(DATA_DIR, 'tournaments.json');
// In-memory store
const tournaments = new Map();
const tournamentResults = new Map();
// Default blind structure
const DEFAULT_BLINDS = [
    { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 10 },
    { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 10 },
    { level: 3, smallBlind: 75, bigBlind: 150, ante: 0, durationMinutes: 10 },
    { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 10 },
    { level: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationMinutes: 10 },
    { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 10 },
    { level: 7, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 10 },
    { level: 8, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 10 },
    { level: 9, smallBlind: 600, bigBlind: 1200, ante: 150, durationMinutes: 10 },
    { level: 10, smallBlind: 1000, bigBlind: 2000, ante: 200, durationMinutes: 10 },
];
// ============== Tournament Creation ==============
/**
 * Create a new scheduled tournament
 */
export function createTournament(options) {
    const tournamentId = randomUUID();
    // Registration closes 5 minutes before start
    const registrationDeadline = options.startTime - 5 * 60 * 1000;
    const tournament = {
        tournamentId,
        name: options.name,
        startTime: options.startTime,
        registrationDeadline,
        buyIn: options.buyIn ?? 0,
        prizePool: options.prizePool ?? 0,
        maxPlayers: options.maxPlayers ?? 64,
        minPlayers: options.minPlayers ?? 2,
        status: 'scheduled',
        registeredBots: [],
        blindStructure: options.blindStructure ?? DEFAULT_BLINDS,
        currentLevel: 0,
    };
    tournaments.set(tournamentId, tournament);
    persistTournamentsDebounced();
    console.log(`[tournament] Created: ${tournament.name} starting at ${new Date(options.startTime).toISOString()}`);
    return tournament;
}
/**
 * Schedule daily freeroll tournaments
 */
export function scheduleDailyTournaments() {
    const now = Date.now();
    const today = new Date(now);
    // Schedule times (UTC)
    const times = [
        { hour: 12, name: 'Noon Showdown' },
        { hour: 18, name: 'Evening Arena' },
        { hour: 23, name: 'Midnight Madness' },
    ];
    for (const { hour, name } of times) {
        const startTime = new Date(today);
        startTime.setUTCHours(hour, 0, 0, 0);
        // If time has passed today, schedule for tomorrow
        if (startTime.getTime() < now) {
            startTime.setDate(startTime.getDate() + 1);
        }
        // Check if already scheduled
        const existing = Array.from(tournaments.values()).find(t => t.name === name &&
            t.status !== 'finished' &&
            t.status !== 'cancelled');
        if (!existing) {
            createTournament({
                name,
                startTime: startTime.getTime(),
                prizePool: 10000, // From creator fees
                maxPlayers: 32,
                minPlayers: 4,
            });
        }
    }
}
// ============== Registration ==============
/**
 * Register a bot for a tournament
 */
export function registerForTournament(tournamentId, botId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) {
        return { ok: false, error: 'Tournament not found' };
    }
    const bot = getBot(botId);
    if (!bot) {
        return { ok: false, error: 'Bot not found' };
    }
    if (bot.status !== 'active') {
        return { ok: false, error: 'Bot is not active' };
    }
    // Check registration is open
    if (tournament.status !== 'scheduled' && tournament.status !== 'registration_open') {
        return { ok: false, error: 'Registration is not open' };
    }
    if (Date.now() > tournament.registrationDeadline) {
        return { ok: false, error: 'Registration deadline passed' };
    }
    // Check not already registered
    if (tournament.registeredBots.includes(botId)) {
        return { ok: false, error: 'Already registered' };
    }
    // Check max players
    if (tournament.registeredBots.length >= tournament.maxPlayers) {
        return { ok: false, error: 'Tournament is full' };
    }
    tournament.registeredBots.push(botId);
    persistTournamentsDebounced();
    console.log(`[tournament] ${bot.name} registered for ${tournament.name}`);
    return { ok: true };
}
/**
 * Unregister a bot from a tournament
 */
export function unregisterFromTournament(tournamentId, botId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) {
        return { ok: false, error: 'Tournament not found' };
    }
    if (tournament.status !== 'scheduled' && tournament.status !== 'registration_open') {
        return { ok: false, error: 'Cannot unregister after tournament starts' };
    }
    const index = tournament.registeredBots.indexOf(botId);
    if (index === -1) {
        return { ok: false, error: 'Not registered' };
    }
    tournament.registeredBots.splice(index, 1);
    persistTournamentsDebounced();
    return { ok: true };
}
// ============== Tournament Lifecycle ==============
/**
 * Tick function - call every second to manage tournament states
 */
export function tickTournaments() {
    const now = Date.now();
    for (const tournament of tournaments.values()) {
        switch (tournament.status) {
            case 'scheduled':
                // Open registration 30 minutes before
                if (now >= tournament.startTime - 30 * 60 * 1000) {
                    tournament.status = 'registration_open';
                    console.log(`[tournament] Registration open: ${tournament.name}`);
                    broadcastTournamentUpdate(tournament);
                }
                break;
            case 'registration_open':
                // Start tournament at scheduled time
                if (now >= tournament.startTime) {
                    if (tournament.registeredBots.length >= tournament.minPlayers) {
                        startTournament(tournament);
                    }
                    else {
                        cancelTournament(tournament, 'Not enough players');
                    }
                }
                break;
            case 'starting':
            case 'running':
            case 'final_table':
                // Game engine handles actual gameplay
                // This just manages blind level updates
                updateBlindLevel(tournament);
                break;
        }
    }
}
/**
 * Start a tournament
 */
function startTournament(tournament) {
    tournament.status = 'starting';
    tournament.currentLevel = 1;
    console.log(`[tournament] Starting: ${tournament.name} with ${tournament.registeredBots.length} bots`);
    // Notify all registered bots
    for (const botId of tournament.registeredBots) {
        sendToBot(botId, {
            type: 'tournament_start',
            tournamentId: tournament.tournamentId,
            name: tournament.name,
        });
    }
    // After 10 seconds, change to running (allow bots to connect)
    setTimeout(() => {
        if (tournament.status === 'starting') {
            tournament.status = 'running';
            broadcastTournamentUpdate(tournament);
        }
    }, 10_000);
    broadcastTournamentUpdate(tournament);
}
/**
 * Cancel a tournament
 */
function cancelTournament(tournament, reason) {
    tournament.status = 'cancelled';
    console.log(`[tournament] Cancelled: ${tournament.name} - ${reason}`);
    // Notify registered bots
    for (const botId of tournament.registeredBots) {
        sendToBot(botId, {
            type: 'error',
            code: 'TOURNAMENT_CANCELLED',
            message: reason,
        });
    }
    broadcastTournamentUpdate(tournament);
    persistTournamentsDebounced();
}
/**
 * Update blind level based on elapsed time
 */
function updateBlindLevel(tournament) {
    if (tournament.status !== 'running' && tournament.status !== 'final_table')
        return;
    const elapsed = Date.now() - tournament.startTime;
    let totalMinutes = 0;
    let newLevel = 1;
    for (const level of tournament.blindStructure) {
        totalMinutes += level.durationMinutes;
        if (elapsed < totalMinutes * 60 * 1000)
            break;
        newLevel = level.level + 1;
    }
    // Cap at max level
    newLevel = Math.min(newLevel, tournament.blindStructure.length);
    if (newLevel !== tournament.currentLevel) {
        tournament.currentLevel = newLevel;
        const blinds = tournament.blindStructure[newLevel - 1];
        console.log(`[tournament] ${tournament.name} level ${newLevel}: ${blinds?.smallBlind}/${blinds?.bigBlind}`);
        broadcastTournamentUpdate(tournament);
    }
}
/**
 * Finish a tournament with results
 */
export function finishTournament(tournamentId, placements) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return;
    tournament.status = 'finished';
    const result = {
        tournamentId,
        placements,
        totalHands: 0, // Would be tracked by game engine
        duration: Math.round((Date.now() - tournament.startTime) / 60_000),
    };
    tournamentResults.set(tournamentId, result);
    // Distribute prizes and update stats
    const prizeDistribution = calculatePrizes(tournament.prizePool, placements.length);
    for (const placement of placements) {
        const prize = prizeDistribution[placement.place - 1] ?? 0;
        placement.prize = prize;
        // Update bot stats
        updateBotStats(placement.botId, {
            won: placement.place === 1,
            handsPlayed: placement.handsPlayed,
            chipsWon: prize,
            eloChange: calculateEloChange(placement.place, placements.length),
            placement: placement.place,
        });
        // Notify bot
        sendToBot(placement.botId, {
            type: 'tournament_end',
            tournamentId,
            placement: placement.place,
            prize,
        });
    }
    console.log(`[tournament] Finished: ${tournament.name}`);
    console.log(`[tournament] Winner: ${placements[0]?.botName} (${placements[0]?.prize} chips)`);
    broadcastTournamentUpdate(tournament);
    persistTournamentsDebounced();
}
/**
 * Calculate prize distribution
 */
function calculatePrizes(prizePool, playerCount) {
    if (playerCount <= 2) {
        return [prizePool];
    }
    if (playerCount <= 4) {
        return [
            Math.round(prizePool * 0.7),
            Math.round(prizePool * 0.3),
        ];
    }
    if (playerCount <= 8) {
        return [
            Math.round(prizePool * 0.5),
            Math.round(prizePool * 0.3),
            Math.round(prizePool * 0.2),
        ];
    }
    // 9+ players
    return [
        Math.round(prizePool * 0.4),
        Math.round(prizePool * 0.25),
        Math.round(prizePool * 0.15),
        Math.round(prizePool * 0.1),
        Math.round(prizePool * 0.1),
    ];
}
/**
 * Calculate ELO change based on placement
 */
function calculateEloChange(place, totalPlayers) {
    // First place gets positive, last place gets negative
    const baseChange = 32;
    const percentile = 1 - ((place - 1) / Math.max(1, totalPlayers - 1));
    return Math.round(baseChange * (percentile * 2 - 1));
}
// ============== Queries ==============
/**
 * Get a tournament by ID
 */
export function getTournament(tournamentId) {
    return tournaments.get(tournamentId) ?? null;
}
/**
 * Get upcoming tournaments
 */
export function getUpcomingTournaments() {
    return Array.from(tournaments.values())
        .filter(t => t.status === 'scheduled' || t.status === 'registration_open')
        .sort((a, b) => a.startTime - b.startTime);
}
/**
 * Get active tournaments
 */
export function getActiveTournaments() {
    return Array.from(tournaments.values())
        .filter(t => t.status === 'starting' || t.status === 'running' || t.status === 'final_table');
}
/**
 * Get recent tournament results
 */
export function getRecentResults(limit = 10) {
    return Array.from(tournamentResults.values())
        .sort((a, b) => {
        const tA = tournaments.get(a.tournamentId)?.startTime ?? 0;
        const tB = tournaments.get(b.tournamentId)?.startTime ?? 0;
        return tB - tA;
    })
        .slice(0, limit);
}
/**
 * Get current blind level for a tournament
 */
export function getCurrentBlinds(tournamentId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return null;
    const level = tournament.currentLevel;
    return tournament.blindStructure[level - 1] ?? null;
}
// ============== Broadcasting ==============
function broadcastTournamentUpdate(tournament) {
    const bot = tournament.registeredBots[0] ? getBot(tournament.registeredBots[0]) : null;
    broadcastToSpectators({
        type: 'tournament_update',
        tournament: {
            tournamentId: tournament.tournamentId,
            name: tournament.name,
            status: tournament.status,
            playerCount: tournament.registeredBots.length,
            currentLevel: tournament.currentLevel,
            blinds: tournament.blindStructure[tournament.currentLevel - 1],
        },
    });
}
// ============== Persistence ==============
let persistTimer = null;
function persistTournamentsDebounced() {
    if (persistTimer)
        clearTimeout(persistTimer);
    persistTimer = setTimeout(persistTournaments, 500);
}
async function persistTournaments() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const data = {
            tournaments: Object.fromEntries(tournaments),
            results: Object.fromEntries(tournamentResults),
        };
        await fs.writeFile(TOURNAMENTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('[tournament] persist error:', e);
    }
}
export async function loadTournaments() {
    try {
        const raw = await fs.readFile(TOURNAMENTS_FILE, 'utf-8');
        const data = JSON.parse(raw || '{}');
        if (data.tournaments) {
            for (const [id, t] of Object.entries(data.tournaments)) {
                tournaments.set(id, t);
            }
        }
        if (data.results) {
            for (const [id, r] of Object.entries(data.results)) {
                tournamentResults.set(id, r);
            }
        }
        console.log(`[tournament] loaded ${tournaments.size} tournaments`);
    }
    catch (e) {
        console.log('[tournament] no existing tournaments file, starting fresh');
    }
}
// ============== Initialization ==============
// Tick every second
setInterval(tickTournaments, 1000);
// Schedule daily tournaments on startup
setTimeout(scheduleDailyTournaments, 5000);
// Re-schedule daily at midnight
setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
        scheduleDailyTournaments();
    }
}, 60_000);
//# sourceMappingURL=tournament.js.map