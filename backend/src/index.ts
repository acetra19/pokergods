import 'dotenv/config';
import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import { TournamentManager, TournamentState } from "./tournament/index.js";
import { GameEngine } from "./game/engine.js";
import { HUManager } from "./hu/manager.js";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// Bot Arena imports
import { 
  initBotModule, 
  handleBotConnection, 
  addSpectator, 
  broadcastToSpectators,
} from "./bot/index.js";
import { botRouter } from "./bot/routes.js";
import { createCorepassRouter } from "./corepass-routes.js";

declare global {
  // eslint-disable-next-line no-var
  var __pg_admin_jwt: string | undefined;
}

const app = express();
app.use(cors());
app.use(createCorepassRouter());
// JSON-Parser nur noch gezielt pro Route einsetzen, um Parse-Fehler bei Nicht‑JSON‑Bodies zu vermeiden
// Zentrales Error‑Handling für JSON‑Parse‑Fehler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const isJsonParse = err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError);
    if (isJsonParse) {
      try { diag('invalid_json', { path: req.path, method: req.method }); } catch {}
      res.status(400).json({ ok:false, error:'invalid json' });
      return;
    }
  } catch {}
  next(err);
});
app.use('/avatars', express.static(path.join(process.cwd(), 'backend', 'data', 'avatars')));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// --- Diagnostics (ring buffer) ---
type Diag = { ts:number; tag:string; data:any }
const DIAG_MAX = 500
const diagBuf: Diag[] = []
function diag(tag: string, data: any) {
  try { diagBuf.push({ ts: Date.now(), tag, data }); while (diagBuf.length > DIAG_MAX) diagBuf.shift() } catch {}
}
app.get('/diag/logs', (_req, res)=> { res.json({ ok:true, logs: diagBuf }) })
app.post('/diag/log', express.json(), (req, res)=> { diag(String(req.body?.tag||'client'), req.body?.data||{}); res.json({ ok:true }) })

// --- Admin auth (JWT‑style HMAC token; beta, no external deps) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const ADMIN_JWT_SECRET = (() => {
  const existing = process.env.ADMIN_JWT_SECRET || (global as any).__pg_admin_jwt;
  if (existing) return existing;
  const generated = randomBytes(32).toString('hex');
  (global as any).__pg_admin_jwt = generated;
  return generated;
})();

const avatarsDir = path.join(process.cwd(), 'backend', 'data', 'avatars');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.AVATAR_MAX_BYTES ?? 2_000_000) },
});

app.post('/profile/:wallet/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { wallet } = req.params;
    if (!wallet) { res.status(400).json({ ok:false, error:'missing wallet' }); return; }
    if (!req.file) { res.status(400).json({ ok:false, error:'missing file' }); return; }
    await fs.mkdir(avatarsDir, { recursive: true });
    const fileName = `${wallet}.jpg`;
    const outPath = path.join(avatarsDir, fileName);
    await sharp(req.file.buffer).resize(256, 256, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(outPath);
    const hostBase = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host') ?? ''}`;
    const normalizedBase = hostBase.replace(/\/$/, '');
    const publicPath = `/avatars/${encodeURIComponent(fileName)}`;
    const publicUrl = normalizedBase ? `${normalizedBase}${publicPath}` : publicPath;
    const existing = profiles.get(wallet);
    const profile: Profile = existing ? { ...existing, avatarUrl: publicUrl } : { username: wallet, avatarUrl: publicUrl };
    profiles.set(wallet, profile);
    await saveProfiles().catch(()=>{});
    res.json({ ok:true, avatarUrl: publicUrl });
  } catch (e:any) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});

type JwtHeader = { alg: 'HS256'; typ: 'JWT' };
type JwtPayload = { u: string; iat: number; exp: number };
function b64url(input: Buffer | string): string {
  const b = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signToken(payload: JwtPayload): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = createHash('sha256').update(data + ADMIN_JWT_SECRET).digest();
  return `${data}.${b64url(sig)}`;
}
function verifyToken(token: string): JwtPayload | null {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const payloadPart = p ?? '';
  const data = `${h}.${payloadPart}`;
  const expected = b64url(createHash('sha256').update(data + ADMIN_JWT_SECRET).digest());
  if (s !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8')) as JwtPayload;
    if (!payload || typeof payload.u !== 'string') return null;
    if (typeof payload.exp !== 'number' || Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const auth = String(req.headers['authorization'] || '');
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const tokenPart = m && m[1];
    if (!tokenPart) { res.status(401).json({ ok:false, error:'missing bearer token' }); return; }
    const payload = verifyToken(tokenPart);
    if (!payload || payload.u !== ADMIN_USER) { res.status(401).json({ ok:false, error:'invalid token' }); return; }
    next();
  } catch { res.status(401).json({ ok:false, error:'unauthorized' }); }
}

app.post('/auth/admin/login', express.json(), (req, res) => {
  const { username, password } = (req.body || {}) as { username?: string; password?: string };
  if (!username || !password) { res.status(400).json({ ok:false, error:'missing credentials' }); return; }
  if (username !== ADMIN_USER || password !== ADMIN_PASS) { res.status(401).json({ ok:false, error:'invalid credentials' }); return; }
  const now = Math.floor(Date.now()/1000);
  const token = signToken({ u: ADMIN_USER, iat: now, exp: now + 60*60*8 }); // 8h
  res.json({ ok:true, token, user: ADMIN_USER, exp: now + 60*60*8 });
});

// Simple in-memory tournament (demo)
const demoTournament = new TournamentManager({
  id: "demo-001",
  name: "Daily Freeroll Demo",
  startTimeMs: Date.now() + 5 * 60_000, // dev: registration window open
  maxPlayers: 1000,
  tableSize: 9,
  blindLevels: [
    { durationSec: 120, smallBlind: 25, bigBlind: 50 },
    { durationSec: 120, smallBlind: 50, bigBlind: 100 },
    { durationSec: 120, smallBlind: 100, bigBlind: 200 },
  ],
});

app.get("/lobby", (_req, res) => {
  res.json(demoTournament.getPublicView());
});

app.post("/register/:wallet", (req, res) => {
  const ok = demoTournament.tryRegister(req.params.wallet);
  res.json({ ok });
});

app.get("/seating", (_req, res) => {
  res.json(demoTournament.getSeating());
});

// HU Blinds: dynamic levels starting from Level 1 at server start
type HUBlindLevel = { durationSec: number; smallBlind: number; bigBlind: number }
const HU_LEVELS: HUBlindLevel[] = (() => {
  try {
    const v: any = demoTournament.getPublicView() as any
    if (v && Array.isArray((v as any).blindLevels) && (v as any).blindLevels.length) {
      return (v as any).blindLevels.map((b:any)=> ({ durationSec: Number(b.durationSec||120), smallBlind: Number(b.smallBlind||25), bigBlind: Number(b.bigBlind||50) }))
    }
  } catch {}
  return [
    { durationSec: 120, smallBlind: 25, bigBlind: 50 },
    { durationSec: 120, smallBlind: 50, bigBlind: 100 },
    { durationSec: 120, smallBlind: 100, bigBlind: 200 },
  ]
})()
const HU_BASE_MS = Date.now()
function getHUStartLevel(): { smallBlind:number; bigBlind:number } {
  const envSB = Number(process.env.HU_START_SB || '')
  const envBB = Number(process.env.HU_START_BB || '')
  if (Number.isFinite(envSB) && Number.isFinite(envBB) && envSB>0 && envBB>0) {
    return { smallBlind: envSB, bigBlind: envBB }
  }
  const first = HU_LEVELS[0] || { durationSec:120, smallBlind:25, bigBlind:50 }
  return { smallBlind: first.smallBlind, bigBlind: first.bigBlind }
}

function getHUCurrentLevel(): { index:number; durationSec:number; smallBlind:number; bigBlind:number } {
  const envSB = Number(process.env.HU_START_SB || '')
  const envBB = Number(process.env.HU_START_BB || '')
  if (Number.isFinite(envSB) && Number.isFinite(envBB) && envSB>0 && envBB>0) {
    return { index: 0, durationSec: HU_LEVELS[0]?.durationSec || 120, smallBlind: envSB, bigBlind: envBB }
  }
  let elapsed = Math.max(0, Math.floor((Date.now() - HU_BASE_MS)/1000))
  let idx = 0
  for (let i=0;i<HU_LEVELS.length;i++) {
    const L = HU_LEVELS[i] || { durationSec:120, smallBlind:25, bigBlind:50 }
    const d = L.durationSec || 120
    if (elapsed < d) { idx = i; break }
    elapsed -= d
    idx = Math.min(HU_LEVELS.length-1, i+1)
  }
  const L = HU_LEVELS[idx] || { durationSec:120, smallBlind:25, bigBlind:50 }
  return { index: idx, durationSec: L.durationSec, smallBlind: L.smallBlind, bigBlind: L.bigBlind }
}

app.get("/level", (_req, res) => {
  const L = getHUCurrentLevel()
  res.json(L)
});

app.post("/admin/reset", adminAuth, (_req, res) => {
  demoTournament.reset(Date.now() + 5 * 60_000);
  res.json({ ok: true });
});

app.post("/admin/startNow", adminAuth, (_req, res) => {
  demoTournament.forceStart(Date.now());
  res.json({ ok: true });
});

// Simple per-table game engines map
const tableEngines = new Map<string, GameEngine>();
const huBlindsByTable = new Map<string, { sb:number; bb:number }>();
const hu = new HUManager();
// Simple in-memory leaderboard for HU sessions (with persistence)
const huLeaderboard = new Map<string, { wins: number; matches: number }>();
// Simple in-memory ELO for HU (with persistence)
const huElo = new Map<string, number>();
// League table and head-to-head stats (in-memory; reset on restart)
const huLeague = new Map<string, { wins:number; losses:number; matches:number; points:number }>();
const huVs = new Map<string, Map<string, { wins:number; losses:number; matches:number }>>();
const getElo = (pid: string) => huElo.get(pid) ?? 1500;
const setElo = (pid: string, r: number) => { huElo.set(pid, Math.round(r)); };
function updateElo(winnerId: string, loserId: string) {
  const Ra = getElo(winnerId);
  const Rb = getElo(loserId);
  const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
  const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
  // Dynamic K-factor: higher when few matches (faster convergence)
  const aw = huLeaderboard.get(resolveDisplayName(winnerId))?.matches || 0;
  const al = huLeaderboard.get(resolveDisplayName(loserId))?.matches || 0;
  const Kw = aw < 10 ? 40 : aw < 30 ? 32 : 24;
  const Kl = al < 10 ? 40 : al < 30 ? 32 : 24;
  setElo(winnerId, Ra + Kw * (1 - Ea));
  setElo(loserId, Rb + Kl * (0 - Eb));
  persistHuDataDebounced();
}

app.post("/hand/start", (req, res) => {
  const lvl = getHUStartLevel();
  const seating = demoTournament.getSeating();
  seating.forEach((table) => {
    let eng = tableEngines.get(table.tableId);
    if (!eng) {
      eng = new GameEngine(table, { sb: lvl.smallBlind, bb: lvl.bigBlind });
      tableEngines.set(table.tableId, eng);
      huBlindsByTable.set(table.tableId, { sb: lvl.smallBlind, bb: lvl.bigBlind })
    }
    // set a fresh provably-fair seed per hand
    const serverSeed = randomBytes(32).toString("hex");
    const commit = createHash("sha256").update(serverSeed).digest("hex");
    fairnessByTable.set(table.tableId, { commit, serverSeed });
    eng.setDeckRng(seedToRng(serverSeed));
    eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
  });
  broadcast({ type: "tournament", payload: { event: "hand_start" } });
  broadcastHandStates();
  broadcastActionStates();
  res.json({ ok: true });
});

app.post("/hand/advance", (req, res) => {
  tableEngines.forEach((eng) => eng.advanceStreet());
  broadcast({ type: "tournament", payload: { event: "hand_advance" } });
  broadcastHandStates();
  broadcastActionStates();
  res.json({ ok: true });
});

app.get("/hand/state", (_req, res) => {
  res.json(Array.from(tableEngines.values()).map((e) => e.getPublic()));
});

app.get("/hand/action_state", (_req, res) => {
  res.json(Array.from(tableEngines.values()).map((e) => e.getActionState()));
});

// Recent hand history (per tableId, up to 50 entries)
app.get("/hand/history", (req, res) => {
  const tableId = (req.query.tableId as string | undefined) || undefined;
  if (tableId) {
    return res.json(handHistoryByTable.get(tableId) ?? []);
  }
  const merged: any[] = [];
  handHistoryByTable.forEach((list) => { merged.push(...list); });
  merged.sort((a, b) => b.ts - a.ts);
  res.json(merged.slice(0, 100));
});

// Session stats endpoint
app.get('/hu/sessionStats', (_req, res) => {
  res.json({ ok:true, topHand: sessionStats.topHand, badBeat: sessionStats.badBeat })
})

app.post("/hand/action", express.json(), (req, res) => {
  const { tableId, playerId, type, amount } = req.body ?? {};
  const eng = tableEngines.get(tableId);
  if (!eng) { res.status(404).json({ ok:false, error:"table not found" }); return; }
  try {
    eng.applyAction(playerId, type, amount);
    const pub = eng.getPublic();
    broadcastHandStates();
    broadcastActionStates();

    const disp = resolveDisplayName(playerId);
    const isAllIn = pub.players?.find((p: any) => p.playerId === playerId)?.allIn ?? false;

    let chatMsg = `${disp} ${type}s`;
    if (type === 'bet') chatMsg = `${disp} bets ${amount ?? ''}`;
    else if (type === 'raise') chatMsg = `${disp} raises to ${amount ?? ''}`;
    else if (type === 'call') chatMsg = `${disp} calls`;
    else if (type === 'check') chatMsg = `${disp} checks`;
    else if (type === 'fold') chatMsg = `${disp} folds`;
    if (isAllIn && type !== 'fold') chatMsg += ' (ALL-IN!)';

    try { broadcastChat(tableId, chatMsg) } catch {}

    // Broadcast a dedicated player_action event for floating UI
    try {
      broadcast({
        type: 'tournament',
        payload: {
          event: 'player_action',
          tableId, playerId, displayName: disp,
          action: type, amount: amount ?? null, allIn: isAllIn,
          pot: pub.pot, street: pub.street,
        },
      } as any);
    } catch {}

    // Winner details are broadcast only when showdown is reached after staged runout (see tick loop).

    res.json({ ok:true });
  } catch (e: any) {
    res.status(400).json({ ok:false, error: String(e?.message ?? e) });
  }
});

// Heads-up endpoints
app.post("/hu/join/:wallet", (req, res) => {
  const { wallet } = req.params;
  // If wallet was in post-match hold, clear it now
  try { postMatchHold.delete(wallet); } catch {}
  const s = hu.join(wallet);
  // If two or more players are queued and this wallet isn't already in a match, start immediately
  if ((s.queueSize ?? 0) >= 2 && !s.matchTableId) {
    tryStartHuMatch();
  }
  res.json(s);
});

// Profiles CRUD
app.get('/profile/:wallet', (req, res) => {
  const w = req.params.wallet;
  const p = profiles.get(w) || null;
  res.json({ ok:true, wallet: w, profile: p });
});
app.post('/profile/:wallet', express.json(), async (req, res) => {
  const w = req.params.wallet;
  const { username, avatarUrl } = req.body || {};
  if (!username || typeof username !== 'string') { res.status(400).json({ ok:false, error:'username required' }); return; }
  const profile = profiles.get(w) ?? { username };
  profile.username = username;
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  profiles.set(w, profile);
  await saveProfiles().catch(()=>{})
  res.json({ ok:true });
});

app.post("/hu/leave/:wallet", (req, res) => {
  const { wallet } = req.params;
  const s = hu.leave(wallet);
  res.json(s);
});

// --- Bot Queue: create instant HU match vs BOT ---
const BOT_ID = 'BOT';
app.post("/hu/bot/join/:wallet", (req, res) => {
  const { wallet } = req.params;
  // If already mapped, return status directly
  const st = hu.status(wallet);
  if (st.matchTableId) { res.json(st); return; }
  // Create table with bot and start engine immediately
  const { table } = hu.createBotMatch(wallet, BOT_ID);
  const lvl = getHUStartLevel();
  const eng = new GameEngine(table, { sb: lvl.smallBlind, bb: lvl.bigBlind });
  tableEngines.set(table.tableId, eng);
  huBlindsByTable.set(table.tableId, { sb: lvl.smallBlind, bb: lvl.bigBlind })
  const serverSeed = randomBytes(32).toString("hex");
  const commit = createHash("sha256").update(serverSeed).digest("hex");
  fairnessByTable.set(table.tableId, { commit, serverSeed });
  eng.setDeckRng(seedToRng(serverSeed));
  eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
  broadcast({ type: "tournament", payload: { event: "hu_bot_match", tableId: table.tableId, participants: table.seats.map(s=>s.playerId) } });
  broadcastHandStates();
  broadcastActionStates();
  res.json({ ok:true, tableId: table.tableId });
});

app.post("/hu/bot/leave/:wallet", (req, res) => {
  const { wallet } = req.params;
  const st = hu.leave(wallet);
  res.json(st);
});

app.get("/hu/bot/status/:wallet", (req, res) => {
  res.json(hu.status(req.params.wallet));
});

app.get("/hu/status", (_req, res) => {
  const s = hu.status(undefined);
  res.json({ ...s, online: onlineCount() });
});
app.get("/hu/status/:wallet", (req, res) => {
  const s = hu.status(req.params.wallet);
  res.json({ ...s, online: onlineCount() });
});

app.get("/hu/leaderboard", (_req, res) => {
  const rows = Array.from(huLeaderboard.entries()).map(([pid, v]) => ({
    playerId: pid,
    displayName: resolveDisplayName(pid),
    wins: v.wins,
    matches: v.matches,
  }));
  // Join with ELO map so die Anzeige nicht bei 1500 stehen bleibt
  const enriched = rows.map(r => ({ ...r, elo: getElo(r.playerId) }))
  enriched.sort((a, b) => b.elo - a.elo || b.wins - a.wins || b.matches - a.matches)
  res.json(enriched.slice(0, 50));
});
app.get("/hu/elo", (_req, res) => {
  const rows = Array.from(huElo.entries()).map(([playerId, rating]) => ({ playerId, rating }));
  rows.sort((a, b) => b.rating - a.rating);
  res.json(rows.slice(0, 50));
});

// League endpoints
app.get('/hu/league', (_req, res) => {
  const rows = Array.from(huLeague.entries()).map(([playerId, s]) => ({ playerId, displayName: resolveDisplayName(playerId), ...s }))
  rows.sort((a,b)=> b.points - a.points || b.wins - a.wins || a.losses - b.losses)
  res.json(rows)
})
app.get('/hu/league/vs', (req, res) => {
  const u = String(req.query.user||'')
  const row = huVs.get(u)
  if (!row) { res.json([]); return }
  const out = Array.from(row.entries()).map(([opp, s])=> ({ opponent: resolveDisplayName(opp), opponentId: opp, ...s }))
  out.sort((a,b)=> b.wins - a.wins || a.losses - b.losses)
  res.json(out)
})

// --- Solana Eligibility (SPL-Token balance) ---
const SOL_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const SPL_TOKEN_MINT = process.env.SOLANA_TOKEN_MINT || "4ikwYoNvoGEwtMbziUyYBTz1zRM6nmxspsfw9G7Bpump"; // test default
const SPL_THRESHOLD = Number(process.env.SOLANA_TOKEN_THRESHOLD || 10000); // human units

type JsonRpcRequest = { jsonrpc: "2.0"; id: string; method: string; params?: any[] };
async function solRpc<T = any>(method: string, params: any[]): Promise<T> {
  const body: JsonRpcRequest = { jsonrpc: "2.0", id: Math.random().toString(36).slice(2), method, params };
  const r = await fetch(SOL_RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`solana rpc http ${r.status}`);
  const js: any = await r.json();
  if (js.error) throw new Error(String(js.error?.message || js.error));
  return js.result as T;
}

app.get("/sol/eligibility", async (req, res) => {
  try {
    const owner = String(req.query.address || '').trim();
    if (!owner) { res.status(400).json({ ok:false, error:"missing address" }); return; }
    // lightweight base58 check
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) { res.status(400).json({ ok:false, error:"invalid address" }); return; }
    const mint = String(req.query.mint || SPL_TOKEN_MINT);
    const thresholdHuman = Number(req.query.threshold || SPL_THRESHOLD);

    // Query token accounts by owner & mint, jsonParsed to get uiAmount
    const ta = await solRpc<any>("getTokenAccountsByOwner", [ owner, { mint }, { encoding: "jsonParsed" } ]);
    let uiAmountSum = 0;
    let decimals: number | null = null;
    try {
      for (const item of (ta?.value || [])) {
        const info = item?.account?.data?.parsed?.info;
        const tok = info?.tokenAmount;
        if (tok) {
          if (typeof tok.decimals === 'number') decimals = tok.decimals;
          const uia = typeof tok.uiAmount === 'number' ? tok.uiAmount : (tok.uiAmountString ? Number(tok.uiAmountString) : 0);
          if (Number.isFinite(uia)) uiAmountSum += uia;
        }
      }
    } catch {}
    // Fallback: getTokenSupply for decimals if none
    if (decimals == null) {
      try {
        const sup = await solRpc<any>("getTokenSupply", [ mint ]);
        if (typeof sup?.value?.decimals === 'number') decimals = sup.value.decimals;
      } catch {}
    }
    if (decimals == null) decimals = 0;
    const eligible = uiAmountSum >= thresholdHuman;
    res.json({ ok:true, eligible, balance: uiAmountSum, decimals, threshold: thresholdHuman, mint, address: owner });
  } catch (e:any) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});
// Fairness endpoints: latest commit or reveal per table
app.get("/fairness/commit", (req, res) => {
  const tableId = (req.query.tableId as string | undefined) || undefined;
  if (!tableId) { res.status(400).json({ ok:false, error:"missing tableId" }); return; }
  const fair = fairnessByTable.get(tableId);
  res.json({ tableId, commit: fair?.commit ?? null });
});
app.get("/fairness/reveal", (req, res) => {
  const tableId = (req.query.tableId as string | undefined) || undefined;
  if (!tableId) { res.status(400).json({ ok:false, error:"missing tableId" }); return; }
  const fair = fairnessByTable.get(tableId);
  res.json({ tableId, commit: fair?.commit ?? null, serverSeed: fair?.serverSeed ?? null, clientSeed: fair?.clientSeed ?? null });
});

app.get("/hu/elo", (_req, res) => {
  const rows = Array.from(huElo.entries()).map(([playerId, rating]) => ({ playerId, rating }));
  rows.sort((a, b) => b.rating - a.rating);
  res.json(rows.slice(0, 50));
});

// ============== Bot Arena API Routes ==============
app.use('/api/v1/bot', express.json(), botRouter);
app.use('/api/v1/bots', express.json(), botRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track online wallets (any page with an active WS connection and identify)
const wsToWallet = new Map<WebSocket, string>();
const walletConnCount = new Map<string, number>();
function incOnline(wallet: string) {
  const n = (walletConnCount.get(wallet) ?? 0) + 1;
  walletConnCount.set(wallet, n);
}
function decOnline(wallet: string) {
  const n = (walletConnCount.get(wallet) ?? 0) - 1;
  if (n <= 0) walletConnCount.delete(wallet); else walletConnCount.set(wallet, n);
}
function onlineCount(): number { return walletConnCount.size }

type ServerMessage =
  | { type: "welcome"; serverTime: number }
  | { type: "echo"; payload: string }
  | { type: "tournament"; payload: unknown }
  | { type: "chat"; payload: { tableId: string | null; message: string; timestamp: number } }
  | { type: "emoji"; payload: { tableId: string; from: string; emoji: string; ts: number } };

wss.on("connection", (ws: WebSocket, request) => {
  // Check if this is a bot connection (has apiKey in URL)
  const url = new URL(request.url ?? '', `http://localhost`);
  const apiKey = url.searchParams.get('apiKey');
  const isBot = url.pathname === '/api/v1/bot/connect' || !!apiKey;
  
  if (isBot) {
    // Handle bot connection via bot module
    handleBotConnection(ws, request);
    return;
  }
  
  // Human/spectator connection - add to spectator list
  addSpectator(ws);
  
  const welcome: ServerMessage = { type: "welcome", serverTime: Date.now() };
  ws.send(JSON.stringify(welcome));

  ws.on("message", (raw: Buffer) => {
    try {
      const txt = raw.toString();
      let obj: any = null;
      try { obj = JSON.parse(txt) } catch {}
      if (obj && obj.type === 'identify' && typeof obj.wallet === 'string') {
        const prev = wsToWallet.get(ws);
        if (prev && prev !== obj.wallet) { decOnline(prev) }
        wsToWallet.set(ws, obj.wallet);
        incOnline(obj.wallet);
        return;
      }
      if (obj && obj.type === 'chat' && typeof obj.tableId==='string' && typeof obj.message==='string') {
        const from = wsToWallet.get(ws) || '';
        const msg = String(obj.message).slice(0, 280);
        if (msg.trim()) {
          broadcast({ type: 'chat', payload: { tableId: obj.tableId, message: `${resolveDisplayName(from)}: ${msg}`, timestamp: Date.now() } });
        }
        return;
      }
      if (obj && obj.type === 'emoji' && typeof obj.tableId==='string' && typeof obj.emoji==='string') {
        const from = wsToWallet.get(ws) || '';
        broadcast({ type:'emoji', payload: { tableId: obj.tableId, from, emoji: obj.emoji, ts: Date.now() } });
        return;
      }
      const echo: ServerMessage = { type: "echo", payload: txt };
      ws.send(JSON.stringify(echo));
    } catch {}
  });

  ws.on('close', () => {
    try {
      const w = wsToWallet.get(ws);
      if (w) { decOnline(w); wsToWallet.delete(ws) }
    } catch {}
  })
});

// Broadcast tournament updates
const broadcast = (msg: ServerMessage) => {
  wss.clients.forEach((client) => {
    if ((client as WebSocket).readyState === 1) {
      (client as WebSocket).send(JSON.stringify(msg));
    }
  });
};

demoTournament.on("update", (view) => broadcast({ type: "tournament", payload: view }));
demoTournament.on("started", (view) => broadcast({ type: "tournament", payload: view }));
demoTournament.on("level", (lvl) => broadcast({ type: "tournament", payload: { event: "level", ...lvl } }));
demoTournament.on("level", (lvl) => broadcastChat(null, `Blinds up: ${lvl.smallBlind}/${lvl.bigBlind}`));
demoTournament.on("finished", (view) => broadcast({ type: "tournament", payload: view }));

// Tick loop
setInterval(() => {
  demoTournament.tick(Date.now());
  // bot logic tick
  botTick(Date.now());
}, 1000);

// In-memory hand history store (recent)
const handHistoryByTable = new Map<string, Array<any>>();
// Session stats: Top Hand and Bad Beat (reset on server restart)
type TopHandEntry = { playerId: string; displayName: string; category: string; tableId: string; handNumber: number; ts: number } | null
type BadBeatEntry = { loserId: string; displayName: string; category: string; winnerId: string; winnerDisplayName: string; winnerCategory: string; tableId: string; handNumber: number; pot: number; ts: number } | null
const sessionStats: { topHand: TopHandEntry; badBeat: BadBeatEntry } = { topHand: null, badBeat: null };
const CATEGORY_ORDER = [
  'High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'
];
const catRank = (c: string) => {
  const i = CATEGORY_ORDER.findIndex(x=> x.toLowerCase() === String(c||'').toLowerCase());
  return i >= 0 ? i : -1;
}

// Broadcast current hand states to clients
const broadcastHandStates = () => {
  const states = Array.from(tableEngines.values()).map((e) => e.getPublic());
  const blindsByTable: Record<string, { sb:number; bb:number }> = {}
  tableEngines.forEach((_e, tid)=> { const b = huBlindsByTable.get(tid); if (b) blindsByTable[tid] = b })
  broadcast({ type: "tournament", payload: { event: "hand_state", states, blindsByTable } });
};

const broadcastActionStates = () => {
  const states = Array.from(tableEngines.values()).map((e) => e.getActionState());
  broadcast({ type: "tournament", payload: { event: "action_state", states } });
};

const broadcastChat = (tableId: string | null, message: string) => {
  broadcast({ type: "chat", payload: { tableId, message, timestamp: Date.now() } });
};

function resolveDisplayName(wallet: string | undefined | null): string {
  if (!wallet) return '';
  const profile = profiles.get(wallet);
  if (profile && typeof profile.username === 'string' && profile.username.trim()) return profile.username.trim();
  return wallet;
}
// Expose resolver to GameEngine dbg for nicer logs
;(globalThis as any).__pgResolveName = (pid: string) => resolveDisplayName(pid);

// Deterministic PRNG from hex seed (xorshift32 based on seed hash)
function seedToRng(hexSeed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < hexSeed.length; i += 1) {
    h ^= hexSeed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let x = (h ^ (h >>> 16)) >>> 0;
  if (x === 0) x = 0x9e3779b9; // avoid zero state
  return () => {
    // xorshift32
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0x1_0000_0000;
  };
}

// Hold window after showdown so UI can display overlay/summary before next hand/rematch
const postShowdownHoldUntilMs = new Map<string, number>();
// Provably-fair commit/reveal per table and hand
const fairnessByTable = new Map<string, { commit: string; serverSeed: string; clientSeed?: string }>();
// Post-match hold: players who finished a HU match and should not auto-requeue
const postMatchHold = new Set<string>();

// --- Simple profile storage (persist to data/profiles.json) ---
type Profile = { username: string; avatarUrl?: string };
const profiles = new Map<string, Profile>();
const profilesPath = path.join(process.cwd(), 'backend', 'data', 'profiles.json');
async function loadProfiles() {
  try {
    const raw = await fs.readFile(profilesPath, 'utf8');
    const obj = JSON.parse(raw || '{}');
    Object.entries(obj || {}).forEach(([wallet, p]: any) => {
      if (p && typeof p.username === 'string') profiles.set(wallet, { username: p.username, avatarUrl: p.avatarUrl });
    });
  } catch {}
}
async function saveProfiles() {
  try {
    const obj: Record<string, Profile> = {};
    profiles.forEach((v, k) => { obj[k] = v });
    await fs.mkdir(path.dirname(profilesPath), { recursive: true });
    await fs.writeFile(profilesPath, JSON.stringify(obj, null, 2), 'utf8');
  } catch {}
}
loadProfiles().catch(()=>{})

// Try to immediately start a HU match if two players are queued
function tryStartHuMatch(): boolean {
  const huMatch = hu.popMatch();
  if (!huMatch) return false;
  const lvl = getHUStartLevel();
  const eng = new GameEngine(huMatch.table, { sb: lvl.smallBlind, bb: lvl.bigBlind });
  tableEngines.set(huMatch.table.tableId, eng);
  huBlindsByTable.set(huMatch.table.tableId, { sb: lvl.smallBlind, bb: lvl.bigBlind })
  // provably-fair: generate server seed, commit, and pre-install RNG for next shuffle
  const serverSeed = randomBytes(32).toString("hex");
  const commit = createHash("sha256").update(serverSeed).digest("hex");
  fairnessByTable.set(huMatch.table.tableId, { commit, serverSeed });
  // optional: clientSeed can be set later via API; for now just use server-only
  eng.setDeckRng(seedToRng(serverSeed));
  eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
  broadcast({ type: "tournament", payload: { event: "hu_match", tableId: huMatch.table.tableId, participants: huMatch.table.seats.map(s=>s.playerId) } });
  // Begrüßung pro Tisch
  broadcastChat(huMatch.table.tableId, `Welcome to Heads‑Up! Blinds ${lvl.smallBlind}/${lvl.bigBlind}`);
  broadcastHandStates();
  broadcastActionStates();
  return true;
}

// --- Simple bot agent (MVP) ---
const botDueAtMsByTable = new Map<string, number>();
function scheduleBot(tableId: string, now: number, minDelay = 400, maxDelay = 900) {
  const due = now + Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
  botDueAtMsByTable.set(tableId, due);
}

function botTick(now: number) {
  tableEngines.forEach((eng, tableId) => {
    try {
      const a = eng.getActionState();
      if (!a) { botDueAtMsByTable.delete(tableId); return; }
      if (a.actorPlayerId !== BOT_ID) { botDueAtMsByTable.delete(tableId); return; }
      const due = botDueAtMsByTable.get(tableId) ?? 0;
      if (now < due) return;
      const committed = (a.committed?.[BOT_ID] ?? 0);
      const toCall = Math.max(0, a.currentBet - committed);
      const can = (x: string) => (a.legalActions || []).includes(x as any);
      // Policy
      if (toCall > 0) {
        if (can('call')) {
          // For test stability: always call when facing a bet/all-in
          eng.applyAction(BOT_ID, 'call');
          broadcastHandStates();
          broadcastActionStates();
          scheduleBot(tableId, now);
          return;
        }
        if (can('fold')) { eng.applyAction(BOT_ID, 'fold'); scheduleBot(tableId, now); return; }
      } else {
        if (can('bet') && Math.random() < 0.2) {
          const minTo = Math.max(a.minRaise, a.currentBet || a.minRaise);
          eng.applyAction(BOT_ID, 'bet', minTo);
          broadcastHandStates();
          broadcastActionStates();
          scheduleBot(tableId, now);
          return;
        }
        if (can('check')) { eng.applyAction(BOT_ID, 'check'); broadcastHandStates(); broadcastActionStates(); scheduleBot(tableId, now); return; }
      }
    } catch {
      // ignore bot errors
    }
  });
}

let AUTO_ADVANCE_ENABLED = false;

// Auto-advance streets and start next hand every 3s when running
setInterval(() => {
  // Prefer HU matches when available; otherwise run tournament mode
  if (tryStartHuMatch()) return;

  const view = demoTournament.getPublicView();
  // Tournament auto-advance only if enabled
  if (AUTO_ADVANCE_ENABLED && view.state === TournamentState.Running) {
    // ensure engines exist for current seating
    if (tableEngines.size === 0) {
      const lvl = getHUStartLevel();
      demoTournament.getSeating().forEach((table) => {
        const eng = new GameEngine(table, { sb: lvl.smallBlind, bb: lvl.bigBlind });
        tableEngines.set(table.tableId, eng);
        eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
      });
      broadcastHandStates();
    } else {
      const lvl = getHUStartLevel();
      tableEngines.forEach((eng, tableId) => {
        const st = eng.getPublic().street;
        if (st === null) return;
        if (st === "showdown") {
          const serverSeed = randomBytes(32).toString("hex");
          const commit = createHash("sha256").update(serverSeed).digest("hex");
          fairnessByTable.set(tableId, { commit, serverSeed });
          eng.setDeckRng(seedToRng(serverSeed));
          eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
        } else {
          eng.advanceStreet();
        }
      });
      broadcastHandStates();
    }
  }
  // HU tables: if showdown reached, hold briefly before next hand or rematch.
  if (tableEngines.size > 0) {
          const lvl = getHUStartLevel();
    const toRequeue: { tableId: string; players: string[]; winners: string[] }[] = [];
    let changed = false;
    tableEngines.forEach((eng, tableId) => {
      const didTimeout = eng.tickTimeout(Date.now());
      if (didTimeout) changed = true;
      const pub = eng.getPublic();
      if (pub.street === "showdown") {
        const now = Date.now();
        const holdUntil = postShowdownHoldUntilMs.get(tableId) ?? 0;
        if (!holdUntil) {
          // Start hold window. Use shorter hold for fold-ends (no showdown reveal),
          // longer hold only when real showdown info is present.
          const hasShowdownReveal = Array.isArray(pub.showdownInfo) && pub.showdownInfo.length > 0;
          // Client Reveal-Flow (All-In): Flop/Turn/River pacing + trace dauert ~6.5s
          // Halte deshalb Showdown etwas länger, damit der Client fertig ist
          const baseHoldMs = hasShowdownReveal ? 7500 : 600;
          postShowdownHoldUntilMs.set(tableId, now + baseHoldMs);
          diag('showdown_hold_start', { tableId, handNumber: pub.handNumber, baseHoldMs, hasShowdownReveal });
          // Broadcast winner details only now (after staged runout), not right after the all-in call
          try {
            if (pub.lastWinners?.length) {
              const winners = (pub.lastWinners || []).map((w: any) => ({
                ...w,
                displayName: resolveDisplayName(w.playerId),
                category: (pub.showdownInfo || []).find((s: any) => s.playerId === w.playerId)?.category || '',
              }));
              winners.forEach((w: any) => {
                const winMsg = w.category
                  ? `${w.displayName} wins ${w.amount} with ${w.category}`
                  : `${w.displayName} wins ${w.amount}`;
                broadcastChat(tableId, winMsg);
              });
            }
          } catch {}
          return; // keep broadcasting current showdown state
        }
        if (now < holdUntil) {
          return; // still holding
        }
        // hold elapsed; proceed and clear
        postShowdownHoldUntilMs.delete(tableId);
        diag('showdown_hold_end', { tableId, handNumber: pub.handNumber });
        // reveal fairness info for the completed hand (if present)
        try {
          const fair = fairnessByTable.get(tableId);
          if (fair) {
            broadcast({ type: "tournament", payload: { event: "fairness_reveal", tableId, commit: fair.commit, serverSeed: fair.serverSeed, clientSeed: fair.clientSeed ?? null } });
          }
        } catch {}
          // persist simple hand history (append; keep last 50 per table)
          try {
            const list = handHistoryByTable.get(tableId) ?? [];
    const entry = {
      tableId,
      ts: Date.now(),
      handNumber: pub.handNumber,
      community: pub.community,
      players: pub.players.map((p)=>({ playerId: p.playerId, displayName: resolveDisplayName(p.playerId), chips: p.chips, allIn: p.allIn, busted: p.busted })),
      winners: (pub.lastWinners || []).map((w:any)=> ({ ...w, displayName: resolveDisplayName(w.playerId) })),
      showdownInfo: (pub.showdownInfo || []).map((s:any)=> ({ ...s, displayName: resolveDisplayName(s.playerId) })),
      pot: pub.pot,
    };
            list.push(entry);
            while (list.length > 50) list.shift();
            handHistoryByTable.set(tableId, list);
          } catch {}
        // Update session stats (after history append)
        try {
          const sInfo: any[] = Array.isArray(pub.showdownInfo) ? pub.showdownInfo : []
          if (sInfo.length) {
            // Top Hand
            const best = sInfo.slice().sort((a,b)=> catRank(b.category) - catRank(a.category))[0]
            if (best) {
              const th = sessionStats.topHand
              if (!th || catRank(best.category) > catRank(th.category)) {
                sessionStats.topHand = { playerId: best.playerId, displayName: resolveDisplayName(best.playerId), category: best.category, tableId, handNumber: pub.handNumber, ts: Date.now() }
                broadcast({ type:'tournament', payload:{ event:'session_stats', topHand: sessionStats.topHand, badBeat: sessionStats.badBeat } })
              }
            }
            // Bad Beat: strongest losing hand (no threshold; always pick the strongest losing hand, tiebreak by larger pot)
            const winnerIds = new Set((pub.lastWinners||[]).map((w:any)=> w.playerId))
            const losers = sInfo.filter(s=> !winnerIds.has(s.playerId))
            if (losers.length) {
              const worst = losers.slice().sort((a,b)=> catRank(b.category) - catRank(a.category))[0]
              const win = (pub.lastWinners||[])[0]
              const winCat = (sInfo.find(s=> s.playerId===win?.playerId)?.category) || ''
              const bb = { loserId: worst.playerId, displayName: resolveDisplayName(worst.playerId), category: worst.category, winnerId: win?.playerId||'', winnerDisplayName: resolveDisplayName(win?.playerId||''), winnerCategory: winCat, tableId, handNumber: pub.handNumber, pot: pub.pot, ts: Date.now() }
              const prev = sessionStats.badBeat
              const better = !prev || catRank(worst.category) > catRank(prev.category) || (catRank(worst.category)===catRank(prev.category) && ((pub.pot||0) > (prev.pot||0)))
              if (better) {
                sessionStats.badBeat = bb
                broadcast({ type:'tournament', payload:{ event:'session_stats', topHand: sessionStats.topHand, badBeat: sessionStats.badBeat } })
              }
            }
          }
        } catch {}
        const players = pub.players.map((p) => p.playerId);
        const busted = pub.players.filter((p) => p.busted || p.chips <= 0).map((p) => p.playerId);
        if (busted.length > 0) {
          const winners = (pub.lastWinners ?? []).map((w) => w.playerId);
          toRequeue.push({ tableId, players, winners });
          diag('match_end', { tableId, handNumber: pub.handNumber, winners });
          // Update league and head-to-head
          try {
            const losers = players.filter(p=> !winners.includes(p))
            winners.forEach(w=>{
              const s = huLeague.get(w) || { wins:0, losses:0, matches:0, points:0 }
              s.wins += 1; s.matches += 1; s.points += 3; huLeague.set(w, s)
            })
            losers.forEach(l=>{
              const s = huLeague.get(l) || { wins:0, losses:0, matches:0, points:0 }
              s.losses += 1; s.matches += 1; huLeague.set(l, s)
            })
            if (players.length===2) {
              const aId = String(players[0] || '')
              const bId = String(players[1] || '')
              if (aId && bId) {
                const aMap = huVs.get(aId) || new Map<string, { wins:number; losses:number; matches:number }>();
                const bMap = huVs.get(bId) || new Map<string, { wins:number; losses:number; matches:number }>();
                const aVs = aMap.get(bId) || { wins:0, losses:0, matches:0 }
                const bVs = bMap.get(aId) || { wins:0, losses:0, matches:0 }
                aVs.matches += 1; bVs.matches += 1
                if (winners.includes(aId)) { aVs.wins += 1; bVs.losses += 1 } else if (winners.includes(bId)) { bVs.wins += 1; aVs.losses += 1 }
                aMap.set(bId, aVs); bMap.set(aId, bVs); huVs.set(aId, aMap); huVs.set(bId, bMap)
              }
            }
          } catch {}
        } else {
          // same match continues: start next hand
          const serverSeed = randomBytes(32).toString("hex");
          const commit = createHash("sha256").update(serverSeed).digest("hex");
          fairnessByTable.set(tableId, { commit, serverSeed });
          eng.setDeckRng(seedToRng(serverSeed));
          eng.nextHand({ sb: lvl.smallBlind, bb: lvl.bigBlind });
          diag('next_hand', { tableId });
          changed = true;
        }
      }
    });
    if (changed) { broadcastHandStates(); broadcastActionStates(); }
    if (toRequeue.length) {
      toRequeue.forEach(({ tableId, players, winners }) => {
        tableEngines.delete(tableId);
        // free wallet->table mapping to allow re-join with same name next match
        hu.unmapMany(players);
        players.forEach((pid) => {
          const display = resolveDisplayName(pid);
          const existing = huLeaderboard.get(display) ?? { wins: 0, matches: 0 };
          const row = { wins: existing.wins, matches: existing.matches };
          row.matches += 1;
          if (winners.includes(pid)) row.wins += 1;
          huLeaderboard.set(display, row);
          // move players to post-match hold; explicit user action required to requeue
          postMatchHold.add(pid);
        });
        // ELO update (assume HU: two players)
        if (players.length === 2 && winners.length >= 1) {
          const [p1, p2] = players as [string, string];
          const winner: string | null = winners.includes(p1) ? p1 : winners.includes(p2) ? p2 : null;
          const loser: string = winner === p1 ? p2 : p1;
          if (winner) updateElo(winner, loser);
        }
        // do not auto-requeue; wait for explicit readiness
        persistHuDataDebounced();
      });
      broadcast({ type: "tournament", payload: { event: "hu_postmatch" } });
      // try to instantly match again on next tick
      broadcastHandStates();
    }
  }
  // Halte Action-State (inkl. Deadlines) frisch, auch wenn sich sonst nichts änderte
  broadcastActionStates();
}, 1000);

// Admin: status + toggle auto-advance
app.get("/admin/status", (_req, res) => {
  const v = demoTournament.getPublicView();
  res.json({ autoAdvance: AUTO_ADVANCE_ENABLED, tournament: v });
});

app.post("/admin/autoAdvance", adminAuth, (req, res) => {
  const enabledParam = (req.query.enabled as string | undefined) ?? "";
  if (enabledParam !== "true" && enabledParam !== "false") {
    res.status(400).json({ ok: false, error: "missing ?enabled=true|false" });
    return;
  }
  AUTO_ADVANCE_ENABLED = enabledParam === "true";
  res.json({ ok: true, autoAdvance: AUTO_ADVANCE_ENABLED });
});

// Admin: adjust engine timing (primary decision / timebank) for all tables
app.post("/admin/timing", adminAuth, (req, res) => {
  const primary = Number((req.query.primaryMs as string | undefined) ?? "");
  const bank = Number((req.query.bankMs as string | undefined) ?? "");
  if (!Number.isFinite(primary) || !Number.isFinite(bank)) {
    res.status(400).json({ ok: false, error: "missing ?primaryMs=&bankMs=" });
    return;
  }
  tableEngines.forEach((eng) => eng.setTiming(primary, bank));
  res.json({ ok: true });
});

// DEV-ONLY: rig next hand (holes/board)
app.post("/admin/rig", express.json(), (req, res) => {
  if (process.env.NODE_ENV === 'production') { res.status(403).json({ ok:false, error:'forbidden' }); return; }
  const { tableId, holeBySeat, community } = req.body || {}
  const eng = tableEngines.get(tableId)
  if (!eng) { res.status(404).json({ ok:false, error:'table not found' }); return }
  try { eng.rig({ holeBySeat, community }); res.json({ ok:true }) } catch (e:any) { res.status(400).json({ ok:false, error:String(e?.message||e) }) }
});

// DEV-ONLY: set HU stacks for given table (test helper to force quick bust)
app.post("/admin/hu/setStacks", express.json(), (req, res) => {
  if (process.env.NODE_ENV === 'production') { res.status(403).json({ ok:false, error:'forbidden' }); return; }
  const { tableId, stacks } = (req.body || {}) as { tableId?: string; stacks?: Record<string, number> };
  const eng = tableEngines.get(tableId as string);
  if (!eng) { res.status(404).json({ ok:false, error:'table not found' }); return; }
  try {
    const e: any = eng as any;
    if (!Array.isArray(e.players)) { res.status(500).json({ ok:false, error:'engine players missing' }); return; }
    e.players.forEach((p: any) => {
      const raw = stacks ? (stacks as Record<string, unknown>)[p.playerId] : undefined;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const v = Math.max(0, Math.floor(raw));
        p.chips = v;
      }
    });
    // Optional: clamp pot/committed if exceeding stacks
    try { e.committed = {}; e.currentBet = 0; } catch {}
    broadcastHandStates();
    res.json({ ok:true });
  } catch (err:any) {
    res.status(400).json({ ok:false, error:String(err?.message||err) })
  }
});

// Listen on Railway PORT or fallback to 8080 locally
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, async () => {
  // eslint-disable-next-line no-console
  console.log("server listening on", PORT);
  
  // Initialize legacy HU data
  await loadHuData().catch(() => {});
  
  // Initialize Bot Arena module
  await initBotModule().catch((e) => {
    console.error("Failed to initialize bot module:", e);
  });
  
  console.log("POKERGODS Bot Arena ready!");
});

// --- Persistence (JSON on disk) ---
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'hu.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
async function loadHuData(): Promise<void> {
  try {
    const buf = await fs.readFile(DATA_FILE, 'utf-8');
    const js = JSON.parse(buf || '{}');
    if (js && js.elo && typeof js.elo === 'object') {
      Object.entries(js.elo).forEach(([k, v]) => { if (typeof v === 'number') huElo.set(k, v) });
    }
    if (js && js.leaderboard && typeof js.leaderboard === 'object') {
      Object.entries(js.leaderboard).forEach(([k, v]: any) => {
        if (v && typeof v.wins === 'number' && typeof v.matches === 'number') huLeaderboard.set(k, { wins: v.wins, matches: v.matches })
      });
    }
  } catch {}
}
let persistTimer: NodeJS.Timeout | null = null;
function persistHuDataDebounced() {
  try { if (persistTimer) clearTimeout(persistTimer) } catch {}
  persistTimer = setTimeout(persistHuData, 500);
}
async function persistHuData(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const elo: Record<string, number> = {};
    huElo.forEach((v, k) => { elo[k] = v });
    const leaderboard: Record<string, { wins:number; matches:number }> = {};
    huLeaderboard.forEach((v, k) => { leaderboard[k] = v });
    await fs.writeFile(DATA_FILE, JSON.stringify({ elo, leaderboard }), 'utf-8');
  } catch {}
}

// --- Simple user accounts (username/password + linked wallet) ---
type User = { username: string; wallet: string; passwordHash: string; createdAt: number };
const usersByName = new Map<string, User>();
const usersByWallet = new Map<string, User>();
async function loadUsers(): Promise<void> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    const js = JSON.parse(raw || '{}');
    Object.values(js || {}).forEach((u: any)=>{
      if (u && typeof u.username==='string' && typeof u.wallet==='string' && typeof u.passwordHash==='string') {
        const user: User = { username: u.username, wallet: u.wallet, passwordHash: u.passwordHash, createdAt: Number(u.createdAt||Date.now()) };
        usersByName.set(user.username, user); usersByWallet.set(user.wallet, user);
      }
    })
  } catch {}
}
async function saveUsers(): Promise<void> {
  try {
    const obj: Record<string, User> = {};
    usersByName.forEach((u)=> { obj[u.username] = u });
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {}
}
function hashPassword(pw: string): string {
  const salt = ADMIN_JWT_SECRET.slice(0, 16);
  return createHash('sha256').update(`${salt}:${pw}`).digest('hex');
}
loadUsers().catch(()=>{})

// Check if a wallet is already bound
app.get('/auth/wallet/:wallet', (req, res) => {
  const w = String(req.params.wallet||'');
  const u = usersByWallet.get(w);
  res.json({ ok:true, taken: !!u, username: u?.username || null });
});

// Register new account (username + password + wallet)
app.post('/auth/register', express.json(), async (req, res) => {
  const { username, password, wallet } = (req.body||{}) as { username?:string; password?:string; wallet?:string };
  if (!username || !password || !wallet) { res.status(400).json({ ok:false, error:'missing fields' }); return; }
  if (usersByName.has(username)) { res.status(409).json({ ok:false, error:'username taken' }); return; }
  if (usersByWallet.has(wallet)) { res.status(409).json({ ok:false, error:'wallet already linked' }); return; }
  const u: User = { username, wallet, passwordHash: hashPassword(password), createdAt: Date.now() };
  usersByName.set(username, u); usersByWallet.set(wallet, u);
  await saveUsers().catch(()=>{})
  res.json({ ok:true, user:{ username, wallet } });
});

// Login existing user
app.post('/auth/login', express.json(), (_req, res) => {
  const { username, password } = (_req.body||{}) as { username?:string; password?:string };
  if (!username || !password) { res.status(400).json({ ok:false, error:'missing fields' }); return; }
  const u = usersByName.get(username);
  if (!u || u.passwordHash !== hashPassword(password)) { res.status(401).json({ ok:false, error:'invalid credentials' }); return; }
  res.json({ ok:true, user:{ username: u.username, wallet: u.wallet } });
});

// Change password (self)
app.post('/auth/changePassword', express.json(), (req, res) => {
  const { username, oldPassword, newPassword } = (req.body||{}) as { username?:string; oldPassword?:string; newPassword?:string };
  if (!username || !oldPassword || !newPassword) { res.status(400).json({ ok:false, error:'missing fields' }); return; }
  const u = usersByName.get(username);
  if (!u || u.passwordHash !== hashPassword(oldPassword)) { res.status(401).json({ ok:false, error:'invalid credentials' }); return; }
  u.passwordHash = hashPassword(newPassword);
  usersByName.set(u.username, u); usersByWallet.set(u.wallet, u);
  saveUsers().catch(()=>{});
  res.json({ ok:true });
});

// Admin: set user password
app.post('/admin/users/setPassword', adminAuth, express.json(), (req, res) => {
  const { username, newPassword } = (req.body||{}) as { username?:string; newPassword?:string };
  if (!username || !newPassword) { res.status(400).json({ ok:false, error:'missing fields' }); return; }
  const u = usersByName.get(username);
  if (!u) { res.status(404).json({ ok:false, error:'user not found' }); return; }
  u.passwordHash = hashPassword(newPassword);
  usersByName.set(u.username, u); usersByWallet.set(u.wallet, u);
  saveUsers().catch(()=>{});
  res.json({ ok:true });
});

// Admin: list users (safe fields only)
app.get('/admin/users', adminAuth, (_req, res) => {
  const list = Array.from(usersByName.values()).map(u=> ({ username: u.username, wallet: u.wallet, createdAt: u.createdAt }))
  res.json({ ok:true, users: list });
});

// Admin: list all registered profiles (coreID, displayName, avatar)
app.get('/admin/profiles', adminAuth, (_req, res) => {
  const list: Array<{ coreId: string; displayName: string; avatarUrl: string }> = [];
  profiles.forEach((p, wallet) => {
    list.push({ coreId: wallet, displayName: p.username || wallet, avatarUrl: p.avatarUrl || '' });
  });
  list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  res.json({ ok: true, profiles: list });
});

// Admin: reset HU session leaderboard (wins/matches to 0)
app.post('/admin/hu/resetSession', adminAuth, (_req, res) => {
  try {
    const keys = Array.from(huLeaderboard.keys());
    keys.forEach((k)=> huLeaderboard.set(k, { wins: 0, matches: 0 }));
    persistHuDataDebounced();
    res.json({ ok:true, count: keys.length });
  } catch (e:any) { res.status(500).json({ ok:false, error:String(e?.message||e) }) }
});

// Admin: full leaderboard reset (leaderboard + ELO + league)
app.post('/admin/hu/resetAll', adminAuth, (_req, res) => {
  try {
    huLeaderboard.clear();
    huElo.clear();
    huLeague.clear();
    huVs.clear();
    persistHuDataDebounced();
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }) }
});


