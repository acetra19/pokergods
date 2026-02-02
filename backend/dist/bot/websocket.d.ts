/**
 * POKERGODS Bot Arena - WebSocket Handler
 * Handles real-time communication with bots
 */
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { ServerToBotMessage, BotGameState } from './types.js';
type ActionHandler = (botId: string, action: string, amount?: number) => {
    ok: boolean;
    error?: string;
};
export declare function setActionHandler(handler: ActionHandler): void;
/**
 * Handle new WebSocket connection for bots
 */
export declare function handleBotConnection(ws: WebSocket, request: IncomingMessage): void;
/**
 * Send message to a bot by ID
 */
export declare function sendToBot(botId: string, msg: ServerToBotMessage): boolean;
/**
 * Send game state to a bot
 */
export declare function sendGameState(botId: string, state: BotGameState): boolean;
/**
 * Send action required to a bot
 */
export declare function sendActionRequired(botId: string, state: BotGameState): boolean;
/**
 * Broadcast to all connected bots
 */
export declare function broadcastToBots(msg: ServerToBotMessage): void;
/**
 * Check if a bot is connected
 */
export declare function isBotConnected(botId: string): boolean;
/**
 * Get list of connected bot IDs
 */
export declare function getConnectedBotIds(): string[];
export declare function addSpectator(ws: WebSocket): void;
export declare function broadcastToSpectators(msg: unknown): void;
export declare function getSpectatorCount(): number;
export {};
//# sourceMappingURL=websocket.d.ts.map