/**
 * POKERGODS Bot Arena - Main Module
 * Simple Heads-Up SNG System
 */
export * from './types.js';
export * from './apiKeys.js';
export * from './registry.js';
export * from './websocket.js';
export { joinQueue, leaveQueue, getQueueStatus, getQueuePosition, handleBotAction, getMatch, getBotMatch, getActiveMatches, isInMatch, } from './matchmaking.js';
export type { Match, HandState } from './matchmaking.js';
/**
 * Initialize the bot module
 */
export declare function initBotModule(): Promise<void>;
//# sourceMappingURL=index.d.ts.map