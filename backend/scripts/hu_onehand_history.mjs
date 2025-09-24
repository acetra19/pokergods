/* Play one HU hand by forcing all-in + call, then print hand history JSON */
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

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function tableFor(wallet) {
  for (let i=0;i<50;i++) {
    const s = await getJson(`/hu/status/${wallet}`).catch(()=>null);
    if (s?.matchTableId) return s.matchTableId;
    await sleep(100);
  }
  throw new Error('no table for '+wallet);
}

async function actionStateFor(tableId) {
  const as = await getJson('/hand/action_state').catch(()=>[]);
  return (Array.isArray(as) ? as.find((s) => s && s.tableId === tableId) : null) || null;
}

async function stateFor(tableId) {
  const hs = await getJson('/hand/state').catch(()=>[]);
  return (Array.isArray(hs) ? hs.find((h) => h && h.tableId === tableId) : null) || null;
}

async function main() {
  const h = await getJson('/health'); if (!h.ok) throw new Error('health');
  const A = 'HistA_' + Math.random().toString(36).slice(2,7);
  const B = 'HistB_' + Math.random().toString(36).slice(2,7);
  await postJson(`/hu/join/${A}`);
  await postJson(`/hu/join/${B}`);
  const tableId = await tableFor(A);
  // wait for action state
  let st = null;
  for (let i=0;i<40;i++) { st = await actionStateFor(tableId); if (st && st.actorPlayerId) break; await sleep(100); }
  if (!st) throw new Error('no action state');
  // actor shoves
  const actor = st.actorPlayerId;
  const committed = st.committed?.[actor] ?? 0;
  const target = Math.max((st.currentBet || 0) + (st.minRaise || 0), committed + 1_000_000);
  const type = (st.currentBet || 0) > 0 ? 'raise' : 'bet';
  await postJson('/hand/action', { tableId, playerId: actor, type, amount: target }).catch(()=>{});
  // opponent calls if needed
  for (let i=0;i<40;i++) {
    const st2 = await actionStateFor(tableId).catch(()=>null);
    if (st2 && st2.legalActions && st2.legalActions.includes('call')) {
      await postJson('/hand/action', { tableId, playerId: st2.actorPlayerId, type: 'call' }).catch(()=>{});
      break;
    }
    await sleep(100);
  }
  // wait for showdown
  let sd = null;
  for (let i=0;i<80;i++) { sd = await stateFor(tableId); if (sd?.street === 'showdown') break; await sleep(100); }
  if (!sd || sd.street !== 'showdown') throw new Error('no showdown');
  const hist = {
    ok: true,
    tableId,
    handNumber: sd.handNumber,
    community: sd.community,
    players: sd.players.map(p=>({ playerId: p.playerId, chips: p.chips, allIn: p.allIn, busted: p.busted })),
    winners: sd.lastWinners,
    showdownInfo: sd.showdownInfo,
    pot: sd.pot
  };
  console.log(JSON.stringify(hist, null, 2));
}

main().catch((e) => { console.error('ONEHAND_FAIL', e.message); process.exit(1) })


