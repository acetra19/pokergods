/**
 * POKERGODS Bot Arena - Matchmaking
 * Simple Heads-Up SNG Matchmaking System
 */

import { randomUUID } from 'node:crypto'
import { getBot, updateBotStats } from './registry.js'
import { sendGameState, sendActionRequired, broadcastToSpectators, isBotConnected, getConnectedBotIds } from './websocket.js'
import type { BotGameState, BotActionRequired, Card, LegalAction } from './types.js'

// ============== Types ==============

export interface Match {
  matchId: string
  bot1Id: string
  bot2Id: string
  startTime: number
  status: 'waiting' | 'playing' | 'finished'
  winnerId?: string
  loserId?: string
  handsPlayed: number
  chips: Record<string, number>
  dealer: number
  currentHand?: HandState
}

export type HandStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface HandState {
  handNumber: number
  street: HandStreet
  pot: number
  community: Card[]
  hole: Record<string, Card[]>
  chips: Record<string, number>
  committed: Record<string, number>
  toAct: string
  lastAction?: { botId: string; action: string; amount?: number }
  lastAggressor?: string // Who bet/raised last
  actedThisRound: Set<string> // Who has acted this betting round
  smallBlind: number
  bigBlind: number
  deck: Card[]
  isAllIn: boolean
}

// ============== State ==============

const queue: string[] = []
const matches = new Map<string, Match>()
const botToMatch = new Map<string, string>()

const STARTING_CHIPS = 1000
const SMALL_BLIND = 10
const BIG_BLIND = 20
const ACTION_TIMEOUT_MS = 10000

// ============== Queue ==============

export function joinQueue(botId: string): { ok: boolean; error?: string; position?: number } {
  const bot = getBot(botId)
  if (!bot) return { ok: false, error: 'Bot not found' }
  
  if (!isBotConnected(botId)) {
    return { ok: false, error: 'Bot must be connected via WebSocket' }
  }
  
  if (botToMatch.has(botId)) {
    return { ok: false, error: 'Already in a match' }
  }
  
  if (queue.includes(botId)) {
    return { ok: false, error: 'Already in queue' }
  }
  
  queue.push(botId)
  console.log(`[matchmaking] ${bot.name} joined queue (position ${queue.length})`)
  
  tryCreateMatch()
  
  return { ok: true, position: queue.length }
}

export function leaveQueue(botId: string): { ok: boolean } {
  const idx = queue.indexOf(botId)
  if (idx >= 0) {
    queue.splice(idx, 1)
    console.log(`[matchmaking] Bot ${botId} left queue`)
  }
  return { ok: true }
}

export function getQueueStatus(): { queueSize: number; activeMatches: number } {
  return {
    queueSize: queue.length,
    activeMatches: Array.from(matches.values()).filter(m => m.status === 'playing').length,
  }
}

export function getQueuePosition(botId: string): number {
  return queue.indexOf(botId) + 1
}

// ============== Match Creation ==============

function tryCreateMatch(): void {
  if (queue.length < 2) return
  
  const bot1Id = queue.shift()!
  const bot2Id = queue.shift()!
  
  if (!isBotConnected(bot1Id)) {
    queue.unshift(bot2Id)
    return
  }
  if (!isBotConnected(bot2Id)) {
    queue.unshift(bot1Id)
    return
  }
  
  const matchId = randomUUID()
  const match: Match = {
    matchId,
    bot1Id,
    bot2Id,
    startTime: Date.now(),
    status: 'playing',
    handsPlayed: 0,
    chips: {
      [bot1Id]: STARTING_CHIPS,
      [bot2Id]: STARTING_CHIPS,
    },
    dealer: Math.random() < 0.5 ? 0 : 1,
  }
  
  matches.set(matchId, match)
  botToMatch.set(bot1Id, matchId)
  botToMatch.set(bot2Id, matchId)
  
  const bot1 = getBot(bot1Id)
  const bot2 = getBot(bot2Id)
  console.log(`[matchmaking] Match created: ${bot1?.name} vs ${bot2?.name}`)
  
  broadcastToSpectators({
    type: 'match_start',
    matchId,
    bot1: { botId: bot1Id, name: bot1?.name ?? 'Unknown' },
    bot2: { botId: bot2Id, name: bot2?.name ?? 'Unknown' },
  })
  
  startNewHand(match)
}

// ============== Game Logic ==============

function createDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  const deck: Card[] = []
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit })
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = temp
  }
  return deck
}

function startNewHand(match: Match): void {
  match.handsPlayed++
  match.dealer = match.dealer === 0 ? 1 : 0
  
  const deck = createDeck()
  const sbPlayer = match.dealer === 0 ? match.bot1Id : match.bot2Id
  const bbPlayer = match.dealer === 0 ? match.bot2Id : match.bot1Id
  
  const hole: Record<string, Card[]> = {
    [match.bot1Id]: [deck.pop()!, deck.pop()!],
    [match.bot2Id]: [deck.pop()!, deck.pop()!],
  }
  
  const sbChips = match.chips[sbPlayer] ?? 0
  const bbChips = match.chips[bbPlayer] ?? 0
  const sbAmount = Math.min(SMALL_BLIND, sbChips)
  const bbAmount = Math.min(BIG_BLIND, bbChips)
  
  const hand: HandState = {
    handNumber: match.handsPlayed,
    street: 'preflop',
    pot: sbAmount + bbAmount,
    community: [],
    hole,
    chips: {
      [match.bot1Id]: match.chips[match.bot1Id] ?? 0,
      [match.bot2Id]: match.chips[match.bot2Id] ?? 0,
    },
    committed: {
      [sbPlayer]: sbAmount,
      [bbPlayer]: bbAmount,
    },
    toAct: sbPlayer,
    actedThisRound: new Set<string>(),
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck,
    isAllIn: sbAmount >= sbChips || bbAmount >= bbChips,
  }
  
  hand.chips[sbPlayer] = (hand.chips[sbPlayer] ?? 0) - sbAmount
  hand.chips[bbPlayer] = (hand.chips[bbPlayer] ?? 0) - bbAmount
  
  match.currentHand = hand
  
  console.log(`[matchmaking] Hand #${hand.handNumber} started`)
  
  sendGameStateToBots(match)
  
  if (hand.isAllIn) {
    runOutBoard(match)
  }
}

function sendGameStateToBots(match: Match): void {
  const hand = match.currentHand!
  
  // Don't send action requests during showdown
  if (hand.street === 'showdown') return
  
  for (const botId of [match.bot1Id, match.bot2Id]) {
    const opponentId = botId === match.bot1Id ? match.bot2Id : match.bot1Id
    const seatIndex = botId === match.bot1Id ? 0 : 1
    
    const isYourTurn = hand.toAct === botId && !hand.isAllIn
    
    const state: BotGameState = {
      type: 'game_state',
      tableId: match.matchId,
      handNumber: hand.handNumber,
      street: hand.street,
      pot: hand.pot,
      community: hand.community,
      yourSeat: seatIndex,
      yourHole: hand.hole[botId] ?? [],
      yourChips: hand.chips[botId] ?? 0,
      yourCommitted: hand.committed[botId] ?? 0,
      opponent: {
        seatIndex: seatIndex === 0 ? 1 : 0,
        chips: hand.chips[opponentId] ?? 0,
        committed: hand.committed[opponentId] ?? 0,
        isAllIn: (hand.chips[opponentId] ?? 0) === 0,
      },
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      dealerSeat: match.dealer,
      isYourTurn,
    }
    
    if (isYourTurn) {
      state.actionRequired = getActionRequired(match, botId)
    }
    
    sendGameState(botId, state)
    
    if (state.actionRequired) {
      sendActionRequired(botId, state)
      setTimeout(() => handleTimeout(match.matchId, botId, hand.handNumber), ACTION_TIMEOUT_MS)
    }
  }
  
  broadcastMatchState(match)
}

function getActionRequired(match: Match, botId: string): BotActionRequired {
  const hand = match.currentHand!
  const opponentId = botId === match.bot1Id ? match.bot2Id : match.bot1Id
  
  const myCommitted = hand.committed[botId] ?? 0
  const oppCommitted = hand.committed[opponentId] ?? 0
  const myChips = hand.chips[botId] ?? 0
  
  const toCall = Math.max(0, oppCommitted - myCommitted)
  const canRaise = myChips > toCall
  const minRaise = Math.min(BIG_BLIND, myChips - toCall)
  const maxRaise = myChips - toCall
  
  const actions: LegalAction[] = []
  
  if (toCall === 0) {
    actions.push('check')
    if (canRaise) actions.push('bet')
  } else {
    actions.push('fold')
    if (myChips >= toCall) actions.push('call')
    if (canRaise && myChips > toCall) actions.push('raise')
  }
  
  return {
    legalActions: actions,
    toCall,
    minRaise,
    maxRaise,
    currentBet: oppCommitted,
    deadline: Date.now() + ACTION_TIMEOUT_MS,
  }
}

export function handleBotAction(
  botId: string, 
  action: string, 
  amount?: number
): { ok: boolean; error?: string } {
  const matchId = botToMatch.get(botId)
  if (!matchId) return { ok: false, error: 'Not in a match' }
  
  const match = matches.get(matchId)
  if (!match || match.status !== 'playing') {
    return { ok: false, error: 'Match not active' }
  }
  
  const hand = match.currentHand
  if (!hand || hand.toAct !== botId) {
    return { ok: false, error: 'Not your turn' }
  }
  
  const opponentId = botId === match.bot1Id ? match.bot2Id : match.bot1Id
  const actionReq = getActionRequired(match, botId)
  
  if (!actionReq.legalActions.includes(action as LegalAction)) {
    return { ok: false, error: `Illegal action: ${action}` }
  }
  
  console.log(`[matchmaking] ${botId} action: ${action}${amount ? ` ${amount}` : ''}`)
  
  const myChips = hand.chips[botId] ?? 0
  
  switch (action) {
    case 'fold':
      hand.chips[opponentId] = (hand.chips[opponentId] ?? 0) + hand.pot
      hand.pot = 0
      endHand(match, opponentId, 'fold')
      return { ok: true }
      
    case 'check':
      hand.lastAction = { botId, action: 'check' }
      break
      
    case 'call': {
      const callAmount = Math.min(actionReq.toCall, myChips)
      hand.chips[botId] = myChips - callAmount
      hand.committed[botId] = (hand.committed[botId] ?? 0) + callAmount
      hand.pot += callAmount
      hand.lastAction = { botId, action: 'call', amount: callAmount }
      break
    }
      
    case 'bet':
    case 'raise': {
      const betAmount = Math.min(amount ?? actionReq.minRaise, myChips)
      const totalBet = actionReq.toCall + betAmount
      hand.chips[botId] = myChips - totalBet
      hand.committed[botId] = (hand.committed[botId] ?? 0) + totalBet
      hand.pot += totalBet
      hand.lastAction = { botId, action, amount: betAmount }
      break
    }
  }
  
  if ((hand.chips[botId] ?? 0) === 0 || (hand.chips[opponentId] ?? 0) === 0) {
    hand.isAllIn = true
  }
  
  // Track who acted this round
  hand.actedThisRound.add(botId)
  
  // If bet/raise, opponent needs to act again
  if (action === 'bet' || action === 'raise') {
    hand.lastAggressor = botId
    hand.actedThisRound.clear()
    hand.actedThisRound.add(botId)
  }
  
  const myCommitted = hand.committed[botId] ?? 0
  const oppCommitted = hand.committed[opponentId] ?? 0
  const betsEqual = myCommitted === oppCommitted
  const bothActed = hand.actedThisRound.has(match.bot1Id) && hand.actedThisRound.has(match.bot2Id)
  
  if (bothActed && betsEqual) {
    advanceStreet(match)
  } else {
    hand.toAct = opponentId
    sendGameStateToBots(match)
  }
  
  return { ok: true }
}

function advanceStreet(match: Match): void {
  const hand = match.currentHand!
  
  hand.committed[match.bot1Id] = 0
  hand.committed[match.bot2Id] = 0
  hand.actedThisRound.clear()
  delete hand.lastAggressor
  
  switch (hand.street) {
    case 'preflop':
      hand.street = 'flop'
      hand.community.push(hand.deck.pop()!, hand.deck.pop()!, hand.deck.pop()!)
      break
    case 'flop':
      hand.street = 'turn'
      hand.community.push(hand.deck.pop()!)
      break
    case 'turn':
      hand.street = 'river'
      hand.community.push(hand.deck.pop()!)
      break
    case 'river':
      hand.street = 'showdown'
      resolveShowdown(match)
      return
  }
  
  console.log(`[matchmaking] Street: ${hand.street}`)
  
  if (hand.isAllIn) {
    setTimeout(() => advanceStreet(match), 1000)
    return
  }
  
  hand.toAct = match.dealer === 0 ? match.bot2Id : match.bot1Id
  sendGameStateToBots(match)
}

function runOutBoard(match: Match): void {
  const runNext = () => {
    const hand = match.currentHand
    if (!hand || hand.street === 'showdown') return
    advanceStreet(match)
    // Check again after advance
    const updated = match.currentHand
    if (updated && updated.street !== 'showdown') {
      setTimeout(runNext, 1500)
    }
  }
  
  setTimeout(runNext, 1000)
}

function resolveShowdown(match: Match): void {
  const hand = match.currentHand!
  
  const cards1 = [...(hand.hole[match.bot1Id] ?? []), ...hand.community]
  const cards2 = [...(hand.hole[match.bot2Id] ?? []), ...hand.community]
  const hand1 = evaluateHand(cards1)
  const hand2 = evaluateHand(cards2)
  
  let winnerId: string
  if (hand1 > hand2) {
    winnerId = match.bot1Id
  } else if (hand2 > hand1) {
    winnerId = match.bot2Id
  } else {
    const half = Math.floor(hand.pot / 2)
    hand.chips[match.bot1Id] = (hand.chips[match.bot1Id] ?? 0) + half
    hand.chips[match.bot2Id] = (hand.chips[match.bot2Id] ?? 0) + (hand.pot - half)
    console.log(`[matchmaking] Split pot`)
    endHand(match, null, 'split')
    return
  }
  
  hand.chips[winnerId] = (hand.chips[winnerId] ?? 0) + hand.pot
  console.log(`[matchmaking] Showdown winner: ${winnerId}`)
  
  endHand(match, winnerId, 'showdown')
}

function evaluateHand(cards: Card[]): number {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)
  
  const rankCounts = new Map<number, number>()
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) || 0) + 1)
  }
  
  const counts = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return b[0] - a[0]
  })
  
  let score = 0
  const c0 = counts[0]
  const c1 = counts[1]
  
  if (c0 && c0[1] === 4) {
    score = 7000000 + c0[0] * 10000
  } else if (c0 && c0[1] === 3 && c1 && c1[1] === 2) {
    score = 6000000 + c0[0] * 10000 + c1[0]
  } else if (c0 && c0[1] === 3) {
    score = 3000000 + c0[0] * 10000
  } else if (c0 && c0[1] === 2 && c1 && c1[1] === 2) {
    score = 2000000 + c0[0] * 10000 + c1[0] * 100
  } else if (c0 && c0[1] === 2) {
    score = 1000000 + c0[0] * 10000
  } else {
    score = (ranks[0] ?? 0) * 10000 + (ranks[1] ?? 0) * 100 + (ranks[2] ?? 0)
  }
  
  const suitCounts = new Map<string, number>()
  for (const s of suits) {
    suitCounts.set(s, (suitCounts.get(s) || 0) + 1)
  }
  const isFlush = Array.from(suitCounts.values()).some(c => c >= 5)
  if (isFlush) {
    score = Math.max(score, 5000000 + (ranks[0] ?? 0) * 100)
  }
  
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a)
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    const high = uniqueRanks[i]
    const low = uniqueRanks[i + 4]
    if (high !== undefined && low !== undefined && high - low === 4) {
      score = Math.max(score, 4000000 + high * 100)
    }
  }
  
  if (uniqueRanks.includes(14) && uniqueRanks.includes(2) && 
      uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
    score = Math.max(score, 4000000 + 500)
  }
  
  return score
}

function endHand(match: Match, winnerId: string | null, reason: string): void {
  const hand = match.currentHand!
  
  match.chips[match.bot1Id] = hand.chips[match.bot1Id] ?? 0
  match.chips[match.bot2Id] = hand.chips[match.bot2Id] ?? 0
  
  broadcastToSpectators({
    type: 'hand_result',
    matchId: match.matchId,
    handNumber: hand.handNumber,
    winnerId,
    reason,
    pot: hand.pot,
    community: hand.community,
  })
  
  const chips1 = match.chips[match.bot1Id] ?? 0
  const chips2 = match.chips[match.bot2Id] ?? 0
  
  if (chips1 <= 0) {
    endMatch(match, match.bot2Id)
  } else if (chips2 <= 0) {
    endMatch(match, match.bot1Id)
  } else {
    setTimeout(() => startNewHand(match), 2000)
  }
}

function endMatch(match: Match, winnerId: string): void {
  match.status = 'finished'
  match.winnerId = winnerId
  match.loserId = winnerId === match.bot1Id ? match.bot2Id : match.bot1Id
  
  const winner = getBot(winnerId)
  const loser = getBot(match.loserId)
  
  console.log(`[matchmaking] Match finished! Winner: ${winner?.name}`)
  
  // Simple ELO update
  const K = 32
  const winnerElo = winner?.stats.elo ?? 1500
  const loserElo = loser?.stats.elo ?? 1500
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
  const eloChange = Math.round(K * (1 - expectedWinner))
  
  updateBotStats(winnerId, { 
    won: true, 
    handsPlayed: match.handsPlayed, 
    chipsWon: STARTING_CHIPS, 
    eloChange 
  })
  updateBotStats(match.loserId, { 
    won: false, 
    handsPlayed: match.handsPlayed, 
    chipsWon: -STARTING_CHIPS, 
    eloChange: -eloChange 
  })
  
  broadcastToSpectators({
    type: 'match_end',
    matchId: match.matchId,
    winnerId,
    loserId: match.loserId,
    winnerName: winner?.name,
    loserName: loser?.name,
    handsPlayed: match.handsPlayed,
    eloChange,
  })
  
  botToMatch.delete(match.bot1Id)
  botToMatch.delete(match.bot2Id)
  
  setTimeout(() => matches.delete(match.matchId), 60000)
}

function handleTimeout(matchId: string, botId: string, handNumber: number): void {
  const match = matches.get(matchId)
  if (!match || match.status !== 'playing') return
  if (!match.currentHand || match.currentHand.handNumber !== handNumber) return
  if (match.currentHand.toAct !== botId) return
  
  console.log(`[matchmaking] Timeout for ${botId}, auto-folding`)
  handleBotAction(botId, 'fold')
}

function broadcastMatchState(match: Match): void {
  const hand = match.currentHand
  if (!hand) return
  
  const bot1 = getBot(match.bot1Id)
  const bot2 = getBot(match.bot2Id)
  
  broadcastToSpectators({
    type: 'match_state',
    matchId: match.matchId,
    status: match.status,
    handsPlayed: match.handsPlayed,
    players: [
      { botId: match.bot1Id, name: bot1?.name ?? 'Unknown', chips: hand.chips[match.bot1Id] ?? 0 },
      { botId: match.bot2Id, name: bot2?.name ?? 'Unknown', chips: hand.chips[match.bot2Id] ?? 0 },
    ],
    hand: {
      number: hand.handNumber,
      street: hand.street,
      pot: hand.pot,
      community: hand.community,
      toAct: hand.toAct,
    },
  })
}

// ============== Queries ==============

export function getMatch(matchId: string): Match | undefined {
  return matches.get(matchId)
}

export function getBotMatch(botId: string): Match | undefined {
  const matchId = botToMatch.get(botId)
  return matchId ? matches.get(matchId) : undefined
}

export function getActiveMatches(): Match[] {
  return Array.from(matches.values()).filter(m => m.status === 'playing')
}

export function isInMatch(botId: string): boolean {
  return botToMatch.has(botId)
}
