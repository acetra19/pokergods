/**
 * POKERGODS Bot Arena - Cash Games System
 * Stakes-based tables with join/leave functionality
 */

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getBot, updateBotStats, isBotConnected, sendToBot, broadcastToSpectators } from './index.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const TABLES_FILE = path.join(DATA_DIR, 'cash_tables.json')
const STATS_FILE = path.join(DATA_DIR, 'arena_stats.json')

// ============== Types ==============

export interface CashTable {
  tableId: string
  name: string
  stakes: StakeLevel
  smallBlind: number
  bigBlind: number
  minBuyIn: number      // 20x BB
  maxBuyIn: number      // 200x BB
  maxPlayers: number
  players: TablePlayer[]
  status: 'waiting' | 'playing' | 'paused'
  handNumber: number
  pot: number
  community: any[]
  dealerSeat: number
  currentTurn: number
  createdAt: number
}

export interface TablePlayer {
  botId: string
  botName: string
  seat: number
  chips: number
  status: 'active' | 'sitting_out' | 'all_in' | 'folded'
  betThisRound: number
  holeCards?: any[]
}

export type StakeLevel = 'micro' | 'low' | 'mid' | 'high' | 'nosebleed'

export const STAKES: Record<StakeLevel, { sb: number; bb: number; name: string }> = {
  micro: { sb: 1, bb: 2, name: 'Micro Stakes' },
  low: { sb: 5, bb: 10, name: 'Low Stakes' },
  mid: { sb: 25, bb: 50, name: 'Mid Stakes' },
  high: { sb: 100, bb: 200, name: 'High Stakes' },
  nosebleed: { sb: 500, bb: 1000, name: 'Nosebleed' },
}

export interface ArenaStats {
  botsOnline: number
  activeTables: number
  totalHands: number
  totalChips: number
  lastUpdated: number
}

// ============== Storage ==============

const tables = new Map<string, CashTable>()
let arenaStats: ArenaStats = {
  botsOnline: 0,
  activeTables: 0,
  totalHands: 0,
  totalChips: 0,
  lastUpdated: Date.now(),
}

// ============== Table Management ==============

/**
 * Create a new cash game table
 */
export function createCashTable(options: {
  name: string
  stakes: StakeLevel
  maxPlayers?: number
}): CashTable {
  const stake = STAKES[options.stakes]
  const tableId = randomUUID()
  
  const table: CashTable = {
    tableId,
    name: options.name,
    stakes: options.stakes,
    smallBlind: stake.sb,
    bigBlind: stake.bb,
    minBuyIn: stake.bb * 20,
    maxBuyIn: stake.bb * 200,
    maxPlayers: options.maxPlayers ?? 6,
    players: [],
    status: 'waiting',
    handNumber: 0,
    pot: 0,
    community: [],
    dealerSeat: 0,
    currentTurn: -1,
    createdAt: Date.now(),
  }
  
  tables.set(tableId, table)
  updateArenaStats()
  persistTablesDebounced()
  
  console.log(`[cashgames] Created table: ${table.name} (${stake.name})`)
  
  return table
}

/**
 * Get a table by ID
 */
export function getCashTable(tableId: string): CashTable | null {
  return tables.get(tableId) ?? null
}

/**
 * List all tables, optionally filtered by stakes
 */
export function listCashTables(options?: {
  stakes?: StakeLevel
  hasSeats?: boolean
}): CashTable[] {
  let result = Array.from(tables.values())
  
  if (options?.stakes) {
    result = result.filter(t => t.stakes === options.stakes)
  }
  
  if (options?.hasSeats) {
    result = result.filter(t => t.players.length < t.maxPlayers)
  }
  
  // Sort by player count (most active first)
  result.sort((a, b) => b.players.length - a.players.length)
  
  return result
}

/**
 * Join a table
 */
export function joinCashTable(
  tableId: string,
  botId: string,
  buyIn: number
): { ok: boolean; error?: string; seat?: number } {
  const table = tables.get(tableId)
  if (!table) {
    return { ok: false, error: 'Table not found' }
  }
  
  const bot = getBot(botId)
  if (!bot) {
    return { ok: false, error: 'Bot not found' }
  }
  
  if (bot.status !== 'active') {
    return { ok: false, error: 'Bot is not active' }
  }
  
  // Check if already at table
  if (table.players.some(p => p.botId === botId)) {
    return { ok: false, error: 'Already at this table' }
  }
  
  // Check seats
  if (table.players.length >= table.maxPlayers) {
    return { ok: false, error: 'Table is full' }
  }
  
  // Validate buy-in
  if (buyIn < table.minBuyIn) {
    return { ok: false, error: `Minimum buy-in is ${table.minBuyIn}` }
  }
  if (buyIn > table.maxBuyIn) {
    return { ok: false, error: `Maximum buy-in is ${table.maxBuyIn}` }
  }
  
  // Find empty seat
  const takenSeats = new Set(table.players.map(p => p.seat))
  let seat = 0
  for (let i = 0; i < table.maxPlayers; i++) {
    if (!takenSeats.has(i)) {
      seat = i
      break
    }
  }
  
  const player: TablePlayer = {
    botId,
    botName: bot.name,
    seat,
    chips: buyIn,
    status: 'active',
    betThisRound: 0,
  }
  
  table.players.push(player)
  
  // Auto-start if 2+ players
  if (table.players.length >= 2 && table.status === 'waiting') {
    table.status = 'playing'
  }
  
  updateArenaStats()
  persistTablesDebounced()
  
  // Notify spectators
  broadcastToSpectators({
    type: 'table_update',
    tableId,
    event: 'player_joined',
    player: { botId, botName: bot.name, seat, chips: buyIn },
  })
  
  console.log(`[cashgames] ${bot.name} joined ${table.name} (seat ${seat}, ${buyIn} chips)`)
  
  return { ok: true, seat }
}

/**
 * Leave a table
 */
export function leaveCashTable(
  tableId: string,
  botId: string
): { ok: boolean; error?: string; cashOut?: number } {
  const table = tables.get(tableId)
  if (!table) {
    return { ok: false, error: 'Table not found' }
  }
  
  const playerIndex = table.players.findIndex(p => p.botId === botId)
  if (playerIndex === -1) {
    return { ok: false, error: 'Not at this table' }
  }
  
  const player = table.players[playerIndex]!
  const cashOut = player.chips
  
  // Remove player
  table.players.splice(playerIndex, 1)
  
  // Pause if not enough players
  if (table.players.length < 2) {
    table.status = 'waiting'
  }
  
  updateArenaStats()
  persistTablesDebounced()
  
  // Notify spectators
  broadcastToSpectators({
    type: 'table_update',
    tableId,
    event: 'player_left',
    botId,
    cashOut,
  })
  
  console.log(`[cashgames] ${player.botName} left ${table.name} (${cashOut} chips)`)
  
  return { ok: true, cashOut }
}

/**
 * Get spectator view of a table (no hole cards)
 */
export function getTableSpectatorView(tableId: string): any {
  const table = tables.get(tableId)
  if (!table) return null
  
  return {
    tableId: table.tableId,
    name: table.name,
    stakes: table.stakes,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    status: table.status,
    pot: table.pot,
    community: table.community,
    handNumber: table.handNumber,
    dealerSeat: table.dealerSeat,
    currentTurn: table.currentTurn,
    players: table.players.map(p => ({
      botId: p.botId,
      botName: p.botName,
      seat: p.seat,
      chips: p.chips,
      status: p.status,
      betThisRound: p.betThisRound,
      // No hole cards for spectators (unless showdown)
    })),
  }
}

// ============== Daily Chips ==============

const dailyClaims = new Map<string, number>() // botId -> last claim timestamp
const DAILY_CHIPS = 200
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Claim daily chips
 */
export function claimDailyChips(botId: string): { 
  ok: boolean
  error?: string
  chips?: number
  nextClaimAt?: number 
} {
  const bot = getBot(botId)
  if (!bot) {
    return { ok: false, error: 'Bot not found' }
  }
  
  const lastClaim = dailyClaims.get(botId) ?? 0
  const now = Date.now()
  const nextClaimAt = lastClaim + DAILY_COOLDOWN
  
  if (now < nextClaimAt) {
    return { 
      ok: false, 
      error: 'Already claimed today',
      nextClaimAt,
    }
  }
  
  // Grant chips
  dailyClaims.set(botId, now)
  
  // Update arena stats
  arenaStats.totalChips += DAILY_CHIPS
  updateArenaStats()
  
  console.log(`[cashgames] ${bot.name} claimed ${DAILY_CHIPS} daily chips`)
  
  return { 
    ok: true, 
    chips: DAILY_CHIPS,
    nextClaimAt: now + DAILY_COOLDOWN,
  }
}

/**
 * Check daily claim status
 */
export function getDailyClaimStatus(botId: string): {
  canClaim: boolean
  lastClaimAt: number | null
  nextClaimAt: number | null
  amount: number
} {
  const lastClaim = dailyClaims.get(botId)
  const now = Date.now()
  
  if (!lastClaim) {
    return {
      canClaim: true,
      lastClaimAt: null,
      nextClaimAt: null,
      amount: DAILY_CHIPS,
    }
  }
  
  const nextClaimAt = lastClaim + DAILY_COOLDOWN
  
  return {
    canClaim: now >= nextClaimAt,
    lastClaimAt: lastClaim,
    nextClaimAt,
    amount: DAILY_CHIPS,
  }
}

// ============== Arena Stats ==============

/**
 * Update arena statistics
 */
function updateArenaStats(): void {
  let activeTables = 0
  let totalChips = arenaStats.totalChips
  
  for (const table of tables.values()) {
    if (table.players.length > 0) {
      activeTables++
    }
    // Sum chips on tables
    for (const player of table.players) {
      totalChips += player.chips
    }
  }
  
  arenaStats = {
    botsOnline: 0, // Will be set from websocket module
    activeTables,
    totalHands: arenaStats.totalHands,
    totalChips,
    lastUpdated: Date.now(),
  }
}

/**
 * Get arena stats
 */
export function getArenaStats(): ArenaStats {
  // Update bots online from connected count
  const { getConnectedBotCount } = require('./index.js')
  arenaStats.botsOnline = getConnectedBotCount()
  return { ...arenaStats }
}

/**
 * Increment hands played
 */
export function incrementHandsPlayed(): void {
  arenaStats.totalHands++
  persistStatsDebounced()
}

// ============== Auto-create Default Tables ==============

/**
 * Ensure default tables exist for each stake level
 */
export function ensureDefaultTables(): void {
  const existing = Array.from(tables.values())
  
  for (const [level, stake] of Object.entries(STAKES)) {
    const hasTable = existing.some(t => t.stakes === level)
    if (!hasTable) {
      createCashTable({
        name: `${stake.name} - Table 1`,
        stakes: level as StakeLevel,
        maxPlayers: 6,
      })
    }
  }
}

// ============== Persistence ==============

let persistTablesTimer: ReturnType<typeof setTimeout> | null = null
let persistStatsTimer: ReturnType<typeof setTimeout> | null = null

function persistTablesDebounced(): void {
  if (persistTablesTimer) clearTimeout(persistTablesTimer)
  persistTablesTimer = setTimeout(persistTables, 500)
}

function persistStatsDebounced(): void {
  if (persistStatsTimer) clearTimeout(persistStatsTimer)
  persistStatsTimer = setTimeout(persistStats, 1000)
}

async function persistTables(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const data: Record<string, CashTable> = {}
    tables.forEach((v, k) => { data[k] = v })
    await fs.writeFile(TABLES_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[cashgames] persist tables error:', e)
  }
}

async function persistStats(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(STATS_FILE, JSON.stringify(arenaStats, null, 2), 'utf-8')
  } catch (e) {
    console.error('[cashgames] persist stats error:', e)
  }
}

export async function loadCashGames(): Promise<void> {
  try {
    // Load tables
    const tablesRaw = await fs.readFile(TABLES_FILE, 'utf-8').catch(() => '{}')
    const tablesData = JSON.parse(tablesRaw || '{}')
    for (const [id, table] of Object.entries(tablesData)) {
      tables.set(id, table as CashTable)
    }
    console.log(`[cashgames] loaded ${tables.size} tables`)
    
    // Load stats
    const statsRaw = await fs.readFile(STATS_FILE, 'utf-8').catch(() => '{}')
    const statsData = JSON.parse(statsRaw || '{}')
    if (statsData.totalHands) {
      arenaStats = { ...arenaStats, ...statsData }
    }
    console.log(`[cashgames] loaded stats: ${arenaStats.totalHands} hands played`)
    
    // Ensure default tables
    ensureDefaultTables()
  } catch (e) {
    console.log('[cashgames] no existing data, creating defaults')
    ensureDefaultTables()
  }
}
