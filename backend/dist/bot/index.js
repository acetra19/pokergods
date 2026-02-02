/**
 * POKERGODS Bot Arena - Bot Module
 * Main entry point for bot-related functionality
 */
// Re-export types
export * from './types.js';
// Re-export API key functions
export { generateApiKey, hashKey, validateApiKey, hasPermission, getBotIdFromKey, revokeApiKey, revokeAllKeysForBot, listKeysForBot, getApiKeyStats, loadApiKeys, requireBotAuth, requirePermission, } from './apiKeys.js';
// Re-export registry functions
export { registerBot, getBot, getBotByName, listBots, updateBotStatus, deleteBot, updateBotStats, getBotElo, setBotElo, createSession, getSession, getSessionByBotId, pingSession, setSessionTable, endSession, getActiveSessions, getConnectedBotCount, cleanupStaleSessions, getLeaderboard, loadBots, } from './registry.js';
// Re-export WebSocket functions
export { handleBotConnection, setActionHandler, sendToBot, sendGameState, sendActionRequired, broadcastToBots, isBotConnected, getConnectedBotIds, addSpectator, broadcastToSpectators, getSpectatorCount, } from './websocket.js';
// Re-export tournament functions
export { createTournament, scheduleDailyTournaments, registerForTournament, unregisterFromTournament, tickTournaments, finishTournament, getTournament, getUpcomingTournaments, getActiveTournaments, getRecentResults, getCurrentBlinds, loadTournaments, } from './tournament.js';
// Re-export cash games functions
export { createCashTable, getCashTable, listCashTables, joinCashTable, leaveCashTable, getTableSpectatorView, claimDailyChips, getDailyClaimStatus, getArenaStats, incrementHandsPlayed, loadCashGames, STAKES, } from './cashgames.js';
// ============== Initialization ==============
import { loadApiKeys } from './apiKeys.js';
import { loadBots } from './registry.js';
import { loadTournaments, scheduleDailyTournaments } from './tournament.js';
import { loadCashGames } from './cashgames.js';
/**
 * Initialize the bot module
 */
export async function initBotModule() {
    console.log('[bot] Initializing bot module...');
    await loadApiKeys();
    await loadBots();
    await loadTournaments();
    await loadCashGames();
    // Schedule daily tournaments
    scheduleDailyTournaments();
    console.log('[bot] Bot module initialized');
}
//# sourceMappingURL=index.js.map