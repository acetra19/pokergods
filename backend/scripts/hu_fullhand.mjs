/* Drive a full HU hand from join to showdown by taking minimal legal actions */
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
  const A = 'FlowA_' + Math.random().toString(36).slice(2,7);
  const B = 'FlowB_' + Math.random().toString(36).slice(2,7);
  await postJson(`/hu/join/${A}`);
  await postJson(`/hu/join/${B}`);
  // wait for assigned HU table via status
  let tableId = null;
  for (let i=0;i<40;i++) {
    const s = await getJson(`/hu/status/${A}`).catch(()=>null);
    tableId = s?.matchTableId || null;
    if (tableId) break;
    await sleep(200);
  }
  if (!tableId) throw new Error('no table');

  // Drive actions until showdown
  const MAX_STEPS = 100;
  for (let step=0; step<MAX_STEPS; step++) {
    const hs = await getJson('/hand/state').catch(()=>[]);
    const me = (Array.isArray(hs) ? hs.find((h) => h && h.tableId === tableId) : null) || null;
    const street = me?.street;
    if (street === 'showdown') { console.log('FULLHAND_OK'); return; }

    const list = await getJson('/hand/action_state').catch(()=>[]);
    const st = (Array.isArray(list) ? list.find((s) => s && s.tableId === tableId) : null) || null;
    if (!st) { await sleep(200); continue; }
    const actor = st.actorPlayerId;
    const committed = st.committed?.[actor] ?? 0;
    const toCall = Math.max(0, (st.currentBet || 0) - committed);
    try {
      if (st.legalActions?.includes('check')) {
        await postJson('/hand/action', { tableId, playerId: actor, type: 'check' });
      } else if (st.legalActions?.includes('call') && toCall > 0) {
        await postJson('/hand/action', { tableId, playerId: actor, type: 'call' });
      } else if (st.legalActions?.includes('bet')) {
        const minTo = Math.max(st.minRaise || 0, st.currentBet || (st.minRaise || 0));
        await postJson('/hand/action', { tableId, playerId: actor, type: 'bet', amount: minTo });
      } else if (st.legalActions?.includes('raise')) {
        const to = (st.currentBet || 0) + (st.minRaise || 0);
        await postJson('/hand/action', { tableId, playerId: actor, type: 'raise', amount: to });
      } else {
        // as last resort, fold (should almost never happen in this driver)
        if (st.legalActions?.includes('fold')) {
          await postJson('/hand/action', { tableId, playerId: actor, type: 'fold' });
        }
      }
    } catch (_) { /* ignore and continue */ }
    await sleep(200);
  }
  throw new Error('did not reach showdown within steps');
}

main().catch((e) => { console.error('FULLHAND_FAIL', e.message); process.exit(1) })


