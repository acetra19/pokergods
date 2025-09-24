/* Headless E2E: force all-in + call → auto runout to showdown */
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

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  const h = await getJson('/health');
  if (!h.ok) throw new Error('health not ok');
  const A = 'AllInA_' + Math.random().toString(36).slice(2,7);
  const B = 'AllInB_' + Math.random().toString(36).slice(2,7);
  await postJson(`/hu/join/${A}`);
  await postJson(`/hu/join/${B}`);
  // wait for assigned HU table via status endpoint
  let tableId = null;
  for (let i=0;i<30;i++) {
    const s = await getJson(`/hu/status/${A}`).catch(()=>null);
    tableId = s?.matchTableId || null;
    if (tableId) break;
    await sleep(300);
  }
  if (!tableId) throw new Error('no table');
  // fetch action state repeatedly until we can act
  let as = null;
  for (let i=0;i<20;i++) {
    const list = await getJson('/hand/action_state');
    as = (Array.isArray(list) ? list.find((s) => s && s.tableId === tableId) : null) || null;
    if (as && as.actorPlayerId) break;
    await sleep(200);
  }
  if (!as) throw new Error('no action state');
  // Actor shoves all-in: set amount to committed+chips
  const actor = as.actorPlayerId;
  const committed = as.committed?.[actor] || 0;
  // We cannot query stacks from action_state; approximate with min all-in target as committed + bb * 100 (large cap). Backend will cap to all-in.
  const target = Math.max(as.currentBet + as.minRaise, committed + 999999);
  await postJson('/hand/action', { tableId, playerId: actor, type: as.currentBet>0 ? 'raise' : 'bet', amount: target });
  // Wait for other player to get action and call/check as needed
  for (let i=0;i<30;i++) {
    const list = await getJson('/hand/action_state').catch(()=>[]);
    const st = (Array.isArray(list) ? list.find((s) => s && s.tableId === tableId) : null) || null;
    if (!st) { await sleep(300); continue; }
    if (st.actorPlayerId && st.legalActions && st.legalActions.includes('call')) {
      await postJson('/hand/action', { tableId, playerId: st.actorPlayerId, type: 'call' });
      break;
    }
    await sleep(300);
  }
  // Ensure auto runout to showdown
  for (let i=0;i<50;i++) {
    const hs = await getJson('/hand/state').catch(()=>[]);
    const me = (Array.isArray(hs) ? hs.find((h) => h && h.tableId === tableId) : null) || null;
    const st = me?.street;
    if (st === 'showdown') { console.log('ALLIN_OK'); return; }
    await sleep(300);
  }
  throw new Error('no showdown after all-in');
}

main().catch((e) => { console.error('ALLIN_FAIL', e.message); process.exit(1) })


