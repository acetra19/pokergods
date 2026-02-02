/**
 * POKERGODS Bot Arena - Bot Registry
 * Manages bot registrations, stats, and sessions
 */
import type { BotRegistration, BotStatus, BotSession } from './types.js';
/**
 * Register a new bot
 * Returns the bot record and the raw API key (shown only once)
 */
export declare function registerBot(name: string, ownerId: string): {
    bot: BotRegistration;
    apiKey: string;
} | {
    error: string;
};
/**
 * Get a bot by ID
 */
export declare function getBot(botId: string): BotRegistration | null;
/**
 * Get a bot by name
 */
export declare function getBotByName(name: string): BotRegistration | null;
/**
 * List all bots
 */
export declare function listBots(options?: {
    status?: BotStatus;
    ownerId?: string;
    limit?: number;
    sortBy?: 'elo' | 'wins' | 'created' | 'active';
}): BotRegistration[];
/**
 * Update bot status
 */
export declare function updateBotStatus(botId: string, status: BotStatus): boolean;
/**
 * Delete a bot (and revoke all its keys)
 */
export declare function deleteBot(botId: string): boolean;
/**
 * Update bot stats after a match
 */
export declare function updateBotStats(botId: string, update: {
    won: boolean;
    handsPlayed: number;
    chipsWon: number;
    eloChange: number;
    placement?: number;
}): void;
/**
 * Get ELO for a bot
 */
export declare function getBotElo(botId: string): number;
/**
 * Set ELO for a bot
 */
export declare function setBotElo(botId: string, elo: number): void;
/**
 * Create a new session for a bot
 */
export declare function createSession(botId: string): BotSession;
/**
 * Get a session by ID
 */
export declare function getSession(sessionId: string): BotSession | null;
/**
 * Get session by bot ID (if connected)
 */
export declare function getSessionByBotId(botId: string): BotSession | null;
/**
 * Update session ping time
 */
export declare function pingSession(sessionId: string): boolean;
/**
 * Set session's current table
 */
export declare function setSessionTable(sessionId: string, tableId: string | null): void;
/**
 * End a session
 */
export declare function endSession(sessionId: string): void;
/**
 * Get all active sessions
 */
export declare function getActiveSessions(): BotSession[];
/**
 * Get count of connected bots
 */
export declare function getConnectedBotCount(): number;
/**
 * Clean up stale sessions (no ping in 60s)
 */
export declare function cleanupStaleSessions(): number;
/**
 * Get top bots by ELO
 */
export declare function getLeaderboard(limit?: number): Array<{
    rank: number;
    botId: string;
    name: string;
    elo: number;
    wins: number;
    matches: number;
    winRate: number;
}>;
export declare function loadBots(): Promise<void>;
//# sourceMappingURL=registry.d.ts.map