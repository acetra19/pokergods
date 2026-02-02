/**
 * POKERGODS Bot Arena - WebSocket Handler
 * Handles real-time communication with bots
 */
import { validateApiKey, getBotIdFromKey } from './apiKeys.js';
import { getBot, createSession, endSession, pingSession, getSession, setSessionTable } from './registry.js';
// Map WebSocket -> Session ID
const wsToSession = new Map();
// Map Bot ID -> WebSocket (for sending messages)
const botToWs = new Map();
// Map Session ID -> WebSocket
const sessionToWs = new Map();
let actionHandler = null;
export function setActionHandler(handler) {
    actionHandler = handler;
}
// ============== Connection Handling ==============
/**
 * Handle new WebSocket connection for bots
 */
export function handleBotConnection(ws, request) {
    // Extract API key from query string or headers
    const url = new URL(request.url ?? '', 'http://localhost');
    const apiKey = url.searchParams.get('apiKey')
        ?? request.headers.authorization?.replace('Bearer ', '');
    if (!apiKey) {
        sendError(ws, 'AUTH_REQUIRED', 'API key required');
        ws.close(4001, 'API key required');
        return;
    }
    // Validate API key
    const keyRecord = validateApiKey(apiKey);
    if (!keyRecord) {
        sendError(ws, 'INVALID_KEY', 'Invalid API key');
        ws.close(4001, 'Invalid API key');
        return;
    }
    const botId = keyRecord.botId;
    const bot = getBot(botId);
    if (!bot) {
        sendError(ws, 'BOT_NOT_FOUND', 'Bot not found');
        ws.close(4004, 'Bot not found');
        return;
    }
    if (bot.status !== 'active') {
        sendError(ws, 'BOT_INACTIVE', `Bot status: ${bot.status}`);
        ws.close(4003, 'Bot not active');
        return;
    }
    // Check if bot already connected
    const existingWs = botToWs.get(botId);
    if (existingWs && existingWs.readyState === 1) {
        // Close old connection
        existingWs.close(4000, 'New connection opened');
    }
    // Create session
    const session = createSession(botId);
    // Store mappings
    wsToSession.set(ws, session.sessionId);
    botToWs.set(botId, ws);
    sessionToWs.set(session.sessionId, ws);
    // Send connected message
    send(ws, {
        type: 'connected',
        botId: bot.botId,
        sessionId: session.sessionId,
    });
    console.log(`[ws] Bot connected: ${bot.name} (${botId})`);
    // Set up message handler
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            handleBotMessage(ws, botId, session.sessionId, msg);
        }
        catch (e) {
            sendError(ws, 'INVALID_MESSAGE', 'Invalid JSON');
        }
    });
    // Handle disconnect
    ws.on('close', () => {
        handleBotDisconnect(ws);
    });
    ws.on('error', (err) => {
        console.error(`[ws] Bot error (${bot.name}):`, err.message);
        handleBotDisconnect(ws);
    });
    // Start ping interval
    const pingInterval = setInterval(() => {
        if (ws.readyState === 1) {
            send(ws, { type: 'ping' });
        }
        else {
            clearInterval(pingInterval);
        }
    }, 15_000);
}
/**
 * Handle incoming message from bot
 */
function handleBotMessage(ws, botId, sessionId, msg) {
    switch (msg.type) {
        case 'pong':
            pingSession(sessionId);
            break;
        case 'action':
            handleBotAction(ws, botId, msg.action, msg.amount);
            break;
        default:
            sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type`);
    }
}
/**
 * Handle bot action (fold/check/call/bet/raise)
 */
function handleBotAction(ws, botId, action, amount) {
    if (!actionHandler) {
        sendError(ws, 'NO_GAME', 'No active game');
        return;
    }
    const result = actionHandler(botId, action, amount);
    if (!result.ok) {
        sendError(ws, 'ACTION_FAILED', result.error ?? 'Action failed');
    }
}
/**
 * Handle bot disconnect
 */
function handleBotDisconnect(ws) {
    const sessionId = wsToSession.get(ws);
    if (!sessionId)
        return;
    const session = getSession(sessionId);
    if (session) {
        console.log(`[ws] Bot disconnected: ${session.botId}`);
        botToWs.delete(session.botId);
    }
    wsToSession.delete(ws);
    sessionToWs.delete(sessionId);
    endSession(sessionId);
}
// ============== Sending Messages ==============
/**
 * Send message to a specific WebSocket
 */
function send(ws, msg) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
    }
}
/**
 * Send error message
 */
function sendError(ws, code, message) {
    send(ws, { type: 'error', code, message });
}
/**
 * Send message to a bot by ID
 */
export function sendToBot(botId, msg) {
    const ws = botToWs.get(botId);
    if (!ws || ws.readyState !== 1)
        return false;
    send(ws, msg);
    return true;
}
/**
 * Send game state to a bot
 */
export function sendGameState(botId, state) {
    return sendToBot(botId, { type: 'game_state', state });
}
/**
 * Send action required to a bot
 */
export function sendActionRequired(botId, state) {
    return sendToBot(botId, { type: 'action_required', state });
}
/**
 * Broadcast to all connected bots
 */
export function broadcastToBots(msg) {
    for (const ws of botToWs.values()) {
        if (ws.readyState === 1) {
            send(ws, msg);
        }
    }
}
/**
 * Check if a bot is connected
 */
export function isBotConnected(botId) {
    const ws = botToWs.get(botId);
    return ws !== undefined && ws.readyState === 1;
}
/**
 * Get list of connected bot IDs
 */
export function getConnectedBotIds() {
    const connected = [];
    for (const [botId, ws] of botToWs) {
        if (ws.readyState === 1) {
            connected.push(botId);
        }
    }
    return connected;
}
// ============== Spectator Support ==============
// Spectator WebSockets (human viewers)
const spectators = new Set();
export function addSpectator(ws) {
    spectators.add(ws);
    ws.on('close', () => {
        spectators.delete(ws);
    });
}
export function broadcastToSpectators(msg) {
    const data = JSON.stringify(msg);
    for (const ws of spectators) {
        if (ws.readyState === 1) {
            ws.send(data);
        }
    }
}
export function getSpectatorCount() {
    return spectators.size;
}
//# sourceMappingURL=websocket.js.map