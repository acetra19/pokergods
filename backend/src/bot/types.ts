/**
 * POKERGODS Bot Arena - Type Definitions
 * Types for autonomous poker bots/agents
 */

// ============== Bot Registration ==============

export interface BotRegistration {
  botId: string              // Unique bot identifier (UUID)
  name: string               // Display name (e.g., "ClaudePokerPro")
  ownerId: string            // Owner wallet address
  apiKey: string             // Hashed API key for authentication
  createdAt: number          // Unix timestamp
  lastActiveAt: number       // Last connection timestamp
  stats: BotStats
  status: BotStatus
}

export interface BotStats {
  matchesPlayed: number
  matchesWon: number
  handsPlayed: number
  totalWinnings: number      // Cumulative chips won
  elo: number                // Current ELO rating
  bestFinish: number         // Best tournament placement
}

export type BotStatus = 'active' | 'inactive' | 'banned' | 'pending'

// ============== Bot Session ==============

export interface BotSession {
  sessionId: string
  botId: string
  connectedAt: number
  lastPingAt: number
  currentTableId: string | null
  currentTournamentId: string | null
}

// ============== Game State (sent to bots) ==============

export interface BotGameState {
  type: 'game_state'
  tableId: string
  handNumber: number
  street: Street
  pot: number
  community: Card[]
  
  // Bot's own info
  yourSeat: number
  yourHole: Card[]
  yourChips: number
  yourCommitted: number
  
  // Opponent info (limited)
  opponent: {
    seatIndex: number
    chips: number
    committed: number
    isAllIn: boolean
  }
  
  // Blinds
  smallBlind: number
  bigBlind: number
  dealerSeat: number
  
  // Action info (only when it's bot's turn)
  isYourTurn: boolean
  actionRequired?: BotActionRequired
}

export interface BotActionRequired {
  deadline: number           // Unix timestamp (ms) - 10s from now
  legalActions: LegalAction[]
  currentBet: number
  minRaise: number
  maxRaise: number           // All-in amount
  toCall: number
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | null

export interface Card {
  suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'
  rank: number               // 2-14 (14 = Ace)
}

export type LegalAction = 'fold' | 'check' | 'call' | 'bet' | 'raise'

// ============== Bot Actions (received from bots) ==============

export interface BotAction {
  type: 'action'
  action: LegalAction
  amount?: number            // Required for bet/raise
}

// ============== WebSocket Messages ==============

// Server → Bot messages
export type ServerToBotMessage =
  | { type: 'connected'; botId: string; sessionId: string }
  | { type: 'game_state'; state: BotGameState }
  | { type: 'action_required'; state: BotGameState }
  | { type: 'hand_result'; result: HandResult }
  | { type: 'match_start'; tableId: string; opponent: string }
  | { type: 'match_end'; result: MatchResult }
  | { type: 'tournament_start'; tournamentId: string; name: string }
  | { type: 'tournament_end'; tournamentId: string; placement: number; prize: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'ping' }

// Bot → Server messages
export type BotToServerMessage =
  | { type: 'action'; action: LegalAction; amount?: number }
  | { type: 'pong' }

// ============== Hand/Match Results ==============

export interface HandResult {
  tableId: string
  handNumber: number
  winners: { botId: string; amount: number }[]
  showdown?: ShowdownInfo[]
  yourChipsAfter: number
}

export interface ShowdownInfo {
  botId: string
  hole: Card[]
  category: string           // e.g., "Two Pair", "Flush"
}

export interface MatchResult {
  tableId: string
  winnerId: string
  loserId: string
  handsPlayed: number
  finalChips: { [botId: string]: number }
  eloChange: { [botId: string]: number }
}

// ============== Tournament Types ==============

export interface ScheduledTournament {
  tournamentId: string
  name: string
  startTime: number          // Unix timestamp
  registrationDeadline: number
  buyIn: number              // Entry fee (0 for freeroll)
  prizePool: number          // From creator fees
  maxPlayers: number
  minPlayers: number
  status: TournamentStatus
  registeredBots: string[]   // Bot IDs
  blindStructure: BlindLevel[]
  currentLevel: number
}

export type TournamentStatus = 
  | 'scheduled'              // Future tournament
  | 'registration_open'      // Accepting entries
  | 'starting'               // About to begin
  | 'running'                // In progress
  | 'final_table'            // Down to last table
  | 'finished'               // Complete
  | 'cancelled'              // Not enough players

export interface BlindLevel {
  level: number
  smallBlind: number
  bigBlind: number
  ante: number
  durationMinutes: number
}

export interface TournamentResult {
  tournamentId: string
  placements: TournamentPlacement[]
  totalHands: number
  duration: number           // Minutes
}

export interface TournamentPlacement {
  place: number
  botId: string
  botName: string
  prize: number
  handsPlayed: number
}

// ============== API Key ==============

export interface ApiKeyRecord {
  keyHash: string            // SHA-256 of the actual key
  botId: string
  ownerId: string
  createdAt: number
  lastUsedAt: number
  permissions: ApiKeyPermission[]
}

export type ApiKeyPermission = 'play' | 'register' | 'admin'

// ============== Spectator Types ==============

export interface SpectatorGameState {
  tableId: string
  tournamentId?: string
  handNumber: number
  street: Street
  pot: number
  community: Card[]
  players: SpectatorPlayer[]
  dealerSeat: number
  actorSeat: number | null
  actionDeadline: number | null
  lastAction?: { botId: string; action: string; amount?: number }
}

export interface SpectatorPlayer {
  seatIndex: number
  botId: string
  botName: string
  chips: number
  committed: number
  isAllIn: boolean
  isFolded: boolean
  hole: Card[] | null        // Only shown at showdown
}
