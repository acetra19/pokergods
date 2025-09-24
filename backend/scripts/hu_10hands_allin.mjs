/* Play 10 HU hands, shove on earliest opportunity each hand, collect histories */
const BASE = process.env.BASE || 'http://localhost:8080';

async function getJson(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

async function postJson(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(path + ' ' + (await r.text()));
  return r.json();
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function ensureTableFor(wallet) {
  for (let i=0;i<50;i++) {
    const s = await getJson(`/hu/status/${wallet}`).catch(()=>null);
    if (s?.matchTableId) return s.matchTableId;
    await sleep(200);
  }
  throw new Error('no table for '+wallet);
}

async function getStateFor(tableId) {
  const hs = await getJson('/hand/state').catch(()=>[]);
  return (Array.isArray(hs) ? hs.find((h) => h && h.tableId === tableId) : null) || null;
}

async function getActionFor(tableId) {
  const as = await getJson('/hand/action_state').catch(()=>[]);
  return (Array.isArray(as) ? as.find((s) => s && s.tableId === tableId) : null) || null;
}

async function shoveAllIn(tableId) {
  // wait until we have an actor
  let st = null;
  for (let i=0;i<60;i++) { st = await getActionFor(tableId); if (st && st.actorPlayerId) break; await sleep(150); }
  if (!st) return false;
  const actor = st.actorPlayerId;
  const committed = st.committed?.[actor] ?? 0;
  // target beyond feasible; backend will cap to all-in
  const target = Math.max((st.currentBet || 0) + (st.minRaise || 0), committed + 1_000_000);
  const type = (st.currentBet || 0) > 0 ? 'raise' : 'bet';
  await postJson('/hand/action', { tableId, playerId: actor, type, amount: target }).catch(()=>{});
  // drive opponent to a terminal response
  for (let i=0;i<60;i++) {
    const st2 = await getActionFor(tableId).catch(()=>null);
    if (st2 && st2.actorPlayerId && Array.isArray(st2.legalActions)) {
      const opp = st2.actorPlayerId;
      if (st2.legalActions.includes('call')) {
        await postJson('/hand/action', { tableId, playerId: opp, type: 'call' }).catch(()=>{});
        break;
      }
      if (st2.legalActions.includes('check')) {
        await postJson('/hand/action', { tableId, playerId: opp, type: 'check' }).catch(()=>{});
      } else if (st2.legalActions.includes('fold')) {
        await postJson('/hand/action', { tableId, playerId: opp, type: 'fold' }).catch(()=>{});
        break;
      }
    }
    await sleep(150);
  }
  return true;
}

async function waitShowdown(tableId) {
  for (let i=0;i<120;i++) {
    const st = await getStateFor(tableId);
    if (st?.street === 'showdown') return st;
    await sleep(150);
  }
  return null;
}

async function waitNextHand(tableId, prevHandNumber) {
  for (let i=0;i<60;i++) {
    const st = await getStateFor(tableId);
    if (st && st.handNumber > prevHandNumber && st.street === 'preflop') return st;
    await sleep(200);
  }
  return null;
}

async function main() {
  const h = await getJson('/health'); if (!h.ok) throw new Error('health');
  const A = 'PSA_' + Math.random().toString(36).slice(2,7);
  const B = 'PSB_' + Math.random().toString(36).slice(2,7);
  await postJson(`/hu/join/${A}`);
  await postJson(`/hu/join/${B}`);
  let tableId = await ensureTableFor(A);
  const histories = [];
  for (let hand=1; hand<=10; hand++) {
    // if table was re-created after bust, refresh
    tableId = await ensureTableFor(A);
    const pre = await getStateFor(tableId);
    const preNum = pre?.handNumber ?? 0;
    // shove early
    await shoveAllIn(tableId);
    const sd = await waitShowdown(tableId);
    if (!sd) throw new Error('no showdown');
    histories.push({
      handNumber: sd.handNumber,
      community: sd.community,
      players: sd.players.map(p=>({ playerId: p.playerId, chips: p.chips, allIn: p.allIn, busted: p.busted })),
      winners: sd.lastWinners,
      showdownInfo: sd.showdownInfo,
      pot: sd.pot
    });
    // wait for next hand to begin (unless busted triggers rematch)
    await waitNextHand(tableId, sd.handNumber);
  }
  console.log(JSON.stringify({ ok:true, tableId, histories }, null, 2));
}

main().catch((e)=>{ console.error('TENHANDS_FAIL', e.message); process.exit(1) })


