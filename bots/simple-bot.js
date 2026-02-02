#!/usr/bin/env node
/**
 * POKERGODS Simple Test Bot
 * Heads-Up SNG Bot
 * 
 * Usage:
 *   node simple-bot.js <API_KEY> [SERVER_URL]
 * 
 * Example:
 *   node simple-bot.js pgbot_abc123 http://localhost:8787
 */

const WebSocket = require('ws');

// ============== Configuration ==============

const API_KEY = process.argv[2];
const SERVER = process.argv[3] || 'http://localhost:8787';
const WS_URL = SERVER.replace(/^http/, 'ws');

if (!API_KEY || !API_KEY.startsWith('pgbot_')) {
  console.error('Usage: node simple-bot.js <API_KEY> [SERVER_URL]');
  console.error('Example: node simple-bot.js pgbot_abc123xyz http://localhost:8787');
  process.exit(1);
}

console.log('🤖 POKERGODS Simple Bot - Heads-Up SNG');
console.log(`Server: ${SERVER}`);
console.log(`API Key: ${API_KEY.slice(0, 12)}...`);
console.log('');

// ============== State ==============

let botId = null;
let sessionId = null;
let ws = null;
let inMatch = false;

// ============== HTTP Helpers ==============

async function httpGet(path) {
  const res = await fetch(`${SERVER}${path}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  return res.json();
}

async function httpPost(path, body = {}) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ============== Game Logic ==============

function decideAction(state) {
  const { actionRequired, yourHole, community, pot } = state;
  if (!actionRequired) return null;
  
  const { legalActions, toCall, minRaise } = actionRequired;
  
  // Simple strategy:
  // - Always check if possible
  // - Call small bets
  // - Fold to big bets (unless we have good cards)
  // - Occasionally raise with good hands
  
  const hasGoodHand = evaluateHandStrength(yourHole, community);
  
  if (legalActions.includes('check')) {
    // Free card? Take it!
    if (hasGoodHand > 0.6 && legalActions.includes('bet') && Math.random() > 0.5) {
      return { action: 'bet', amount: minRaise };
    }
    return { action: 'check' };
  }
  
  if (legalActions.includes('call')) {
    const potOdds = toCall / (pot + toCall);
    
    // Good hand? Call or raise
    if (hasGoodHand > 0.7) {
      if (legalActions.includes('raise') && Math.random() > 0.6) {
        return { action: 'raise', amount: minRaise };
      }
      return { action: 'call' };
    }
    
    // Medium hand? Call if cheap
    if (hasGoodHand > 0.4 && potOdds < 0.3) {
      return { action: 'call' };
    }
    
    // Bad hand? Sometimes bluff, usually fold
    if (Math.random() > 0.85) {
      return { action: 'call' }; // Occasional bluff call
    }
    
    return { action: 'fold' };
  }
  
  return { action: 'fold' };
}

function evaluateHandStrength(hole, community) {
  if (!hole || hole.length < 2) return 0.3;
  
  // Simple hand strength heuristic
  const ranks = hole.map(c => c.rank);
  const suits = hole.map(c => c.suit);
  
  let strength = 0.3; // Base
  
  // High cards
  const highCard = Math.max(...ranks);
  if (highCard >= 14) strength += 0.2; // Ace
  else if (highCard >= 13) strength += 0.15; // King
  else if (highCard >= 12) strength += 0.1; // Queen
  
  // Pair
  if (ranks[0] === ranks[1]) {
    strength += 0.3;
    if (ranks[0] >= 10) strength += 0.1; // High pair
  }
  
  // Suited
  if (suits[0] === suits[1]) {
    strength += 0.1;
  }
  
  // Connected
  if (Math.abs(ranks[0] - ranks[1]) === 1) {
    strength += 0.05;
  }
  
  // Cap at 1.0
  return Math.min(strength, 1.0);
}

// ============== WebSocket Connection ==============

function connect() {
  console.log('📡 Connecting to WebSocket...');
  
  ws = new WebSocket(`${WS_URL}?apiKey=${API_KEY}`);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('❌ WebSocket disconnected');
    inMatch = false;
    // Reconnect after 3 seconds
    setTimeout(connect, 3000);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      botId = msg.botId;
      sessionId = msg.sessionId;
      console.log(`🤖 Bot connected: ${botId}`);
      console.log(`   Session: ${sessionId}`);
      // Join queue after connecting
      setTimeout(joinQueue, 1000);
      break;
      
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
      
    case 'queue_joined':
      console.log(`📋 Joined queue at position ${msg.position}`);
      break;
      
    case 'match_start':
      inMatch = true;
      console.log(`\n🎮 ═══════════════════════════════════════`);
      console.log(`   MATCH STARTED!`);
      console.log(`   Opponent: ${msg.opponent?.name || 'Unknown'}`);
      console.log(`═══════════════════════════════════════════\n`);
      break;
      
    case 'game_state':
    case 'action_required':
      handleGameState(msg);
      break;
      
    case 'hand_result':
      console.log(`\n🃏 Hand #${msg.handNumber} finished`);
      console.log(`   Winner: ${msg.winnerId === botId ? 'YOU!' : 'Opponent'}`);
      console.log(`   Reason: ${msg.reason}`);
      if (msg.pot) console.log(`   Pot: ${msg.pot}`);
      break;
      
    case 'match_end':
      inMatch = false;
      console.log(`\n🏆 ═══════════════════════════════════════`);
      if (msg.winnerId === botId) {
        console.log(`   YOU WON THE MATCH!`);
      } else {
        console.log(`   Match over - you lost`);
      }
      console.log(`   Hands played: ${msg.handsPlayed}`);
      console.log(`═══════════════════════════════════════════\n`);
      
      // Re-join queue for next match
      setTimeout(joinQueue, 3000);
      break;
      
    case 'error':
      console.error(`❌ Error: ${msg.code} - ${msg.message}`);
      break;
      
    default:
      // Ignore tournament broadcasts and other noise
      if (msg.type !== 'tournament' && msg.type !== 'match_state') {
        console.log(`📨 ${msg.type}`);
      }
  }
}

function handleGameState(msg) {
  const state = msg.state || msg;
  
  if (!state.isYourTurn) return;
  
  console.log(`\n🎯 YOUR TURN - Hand #${state.handNumber}`);
  console.log(`   Street: ${state.street}`);
  console.log(`   Pot: ${state.pot}`);
  console.log(`   Your cards: ${formatCards(state.yourHole)}`);
  console.log(`   Community: ${formatCards(state.community)}`);
  console.log(`   Your chips: ${state.yourChips}`);
  console.log(`   Opponent chips: ${state.opponent?.chips}`);
  
  if (state.actionRequired) {
    console.log(`   Legal actions: ${state.actionRequired.legalActions.join(', ')}`);
    console.log(`   To call: ${state.actionRequired.toCall}`);
    
    const decision = decideAction(state);
    if (decision) {
      console.log(`   >>> DECISION: ${decision.action}${decision.amount ? ` ${decision.amount}` : ''}`);
      sendAction(decision);
    }
  }
}

function sendAction(decision) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'action',
      action: decision.action,
      amount: decision.amount
    }));
  }
}

function formatCards(cards) {
  if (!cards || cards.length === 0) return '[]';
  const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const ranks = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
  return cards.map(c => `${ranks[c.rank] || c.rank}${suits[c.suit] || c.suit}`).join(' ');
}

// ============== Queue Management ==============

async function joinQueue() {
  if (inMatch) {
    console.log('Already in a match, skipping queue join');
    return;
  }
  
  console.log('\n🎯 Joining matchmaking queue...');
  
  try {
    const result = await httpPost('/api/v1/bot/queue/join');
    
    if (result.ok) {
      console.log(`✅ ${result.message}`);
      console.log('⏳ Waiting for opponent...');
    } else {
      console.log(`❌ Failed to join queue: ${result.error}`);
      // Retry in a bit
      setTimeout(joinQueue, 5000);
    }
  } catch (e) {
    console.error('Error joining queue:', e.message);
    setTimeout(joinQueue, 5000);
  }
}

// ============== Main ==============

console.log('Starting bot...\n');
connect();

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n\n👋 Bot shutting down...');
  if (ws) ws.close();
  process.exit(0);
});
