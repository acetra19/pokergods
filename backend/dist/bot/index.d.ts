/**
 * POKERGODS Bot Arena - Bot Module
 * Main entry point for bot-related functionality
 */
export * from './types.js';
export { generateApiKey, hashKey, validateApiKey, hasPermission, getBotIdFromKey, revokeApiKey, revokeAllKeysForBot, listKeysForBot, getApiKeyStats, loadApiKeys, requireBotAuth, requirePermission, } from './apiKeys.js';
export { registerBot, getBot, getBotByName, listBots, updateBotStatus, deleteBot, updateBotStats, getBotElo, setBotElo, createSession, getSession, getSessionByBotId, pingSession, setSessionTable, endSession, getActiveSessions, getConnectedBotCount, cleanupStaleSessions, getLeaderboard, loadBots, } from './registry.js';
export { handleBotConnection, setActionHandler, sendToBot, sendGameState, sendActionRequired, broadcastToBots, isBotConnected, getConnectedBotIds, addSpectator, broadcastToSpectators, getSpectatorCount, } from './websocket.js';
export { createTournament, scheduleDailyTournaments, registerForTournament, unregisterFromTournament, tickTournaments, finishTournament, getTournament, getUpcomingTournaments, getActiveTournaments, getRecentResults, getCurrentBlinds, loadTournaments, } from './tournament.js';
export { createCashTable, getCashTable, listCashTables, joinCashTable, leaveCashTable, getTableSpectatorView, claimDailyChips, getDailyClaimStatus, getArenaStats, incrementHandsPlayed, loadCashGames, STAKES, type StakeLevel, type CashTable, type TablePlayer, type ArenaStats, } from './cashgames.js';
/**
 * Initialize the bot module
 */
export declare function initBotModule(): Promise<void>;
//# sourceMappingURL=index.d.ts.map