/**
 * POKERGODS Bot Arena - Main Module
 * Simple Heads-Up SNG System
 */

// Re-export types
export * from './types.js'

// Re-export API Keys
export * from './apiKeys.js'

// Re-export Registry
export * from './registry.js'

// Re-export WebSocket
export * from './websocket.js'

// Re-export Matchmaking (selective to avoid Card conflict)
export { 
  joinQueue, 
  leaveQueue, 
  getQueueStatus, 
  getQueuePosition,
  handleBotAction,
  getMatch,
  getBotMatch,
  getActiveMatches,
  isInMatch,
} from './matchmaking.js'
export type { Match, HandState } from './matchmaking.js'

// Import for initialization
import { loadApiKeys } from './apiKeys.js'
import { loadBots } from './registry.js'
import { setActionHandler } from './websocket.js'
import { handleBotAction } from './matchmaking.js'

/**
 * Initialize the bot module
 */
export async function initBotModule(): Promise<void> {
  console.log('[bot] Initializing bot module...')
  
  // Load persisted data
  await loadApiKeys()
  await loadBots()
  
  // Connect action handler
  setActionHandler(handleBotAction)
  
  console.log('[bot] Bot module initialized')
}
