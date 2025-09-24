/* Load test: join 11 clients and drive action (check/call/min-bet) */
const BASE = process.env.BASE || 'http://localhost:8080';

async function getJson(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

async function postJson(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text().catch(()=>'')));
  try { return await r.json(); } catch { return {}; }
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
  // Health
  const h = await getJson('/health');
  if (!h.ok) throw new Error('health not ok');
  console.log('Health OK');

  // Join 11 wallets
  const N = 11;
  const players = Array.from({ length: N }).map((_, i) => 'Load' + (i+1) + '_' + Math.random().toString(36).slice(2,6));
  await Promise.all(players.map((w) => postJson(`/hu/join/${w}`)));
  console.log('Joined', players.length);

  // Drive actions for ~45s
  const TS_END = Date.now() + 45_000;
  let ticks = 0; let acted = 0;
  while (Date.now() < TS_END) {
    ticks++;
    // poll action_state
    let as;
    try { as = await getJson('/hand/action_state'); } catch { as = []; }
    for (const st of Array.isArray(as) ? as : []) {
      if (!st || !st.legalActions || !st.actorPlayerId) continue;
      const tableId = st.tableId;
      const actor = st.actorPlayerId;
      const legal = st.legalActions;
      try {
        if (legal.includes('check')) {
          await postJson('/hand/action', { tableId, playerId: actor, type: 'check' });
          acted++; continue;
        }
        if (legal.includes('call')) {
          await postJson('/hand/action', { tableId, playerId: actor, type: 'call' });
          acted++; continue;
        }
        if (legal.includes('bet')) {
          const amt = Math.max(st.minRaise || 0, st.currentBet || 0 || st.minRaise || 0);
          await postJson('/hand/action', { tableId, playerId: actor, type: 'bet', amount: amt });
          acted++; continue;
        }
        if (legal.includes('raise')) {
          const to = (st.currentBet || 0) + (st.minRaise || 0);
          await postJson('/hand/action', { tableId, playerId: actor, type: 'raise', amount: to });
          acted++; continue;
        }
      } catch (_) { /* ignore individual action errors */ }
    }
    if (ticks % 10 === 0) {
      const hs = await getJson('/hand/state').catch(()=>[]);
      const tables = Array.isArray(hs) ? hs.length : 0;
      console.log('tick', ticks, 'tables', tables, 'acted', acted);
    }
    await sleep(500);
  }

  console.log('LOAD11_OK', { ticks, acted });
}

main().catch((e) => { console.error('LOAD11_FAIL', e.message); process.exit(1); });


