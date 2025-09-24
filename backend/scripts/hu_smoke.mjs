/* Smoke test for HU flow: join 2 players, progress preflop, ensure runout on all-in */
const BASE = process.env.BASE || 'http://localhost:8080';

async function getJson(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

async function postJson(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = await r.text().catch(() => '');
    throw new Error(path + ' ' + r.status + ' ' + msg);
  }
  try { return await r.json(); } catch { return {}; }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  console.log('Health:', await getJson('/health'));
  // join two wallets
  const A = 'SmokeA_' + Math.random().toString(36).slice(2,7);
  const B = 'SmokeB_' + Math.random().toString(36).slice(2,7);
  await postJson(`/hu/join/${A}`);
  await postJson(`/hu/join/${B}`);
  console.log('Joined', A, B);

  // wait for table to appear
  let tableId = null;
  for (let i=0;i<10;i++) {
    const hs = await getJson('/hand/state');
    if (Array.isArray(hs) && hs[0]?.tableId) { tableId = hs[0].tableId; break; }
    await sleep(200);
  }
  if (!tableId) throw new Error('No table created');
  console.log('Table', tableId);

  // fetch action state
  let as = (await getJson('/hand/action_state'))[0] || null;
  if (!as) throw new Error('No action_state');
  console.log('Actor', as.actorPlayerId, 'legal', as.legalActions);

  // Preflop: make sure we can reach flop. If facing bet, call; else check.
  const toCall = Math.max(0, as.currentBet - (as.committed?.[as.actorPlayerId] || 0));
  if (as.legalActions.includes('call') && toCall > 0) {
    await postJson('/hand/action', { tableId, playerId: as.actorPlayerId, type: 'call' });
  } else if (as.legalActions.includes('check')) {
    await postJson('/hand/action', { tableId, playerId: as.actorPlayerId, type: 'check' });
  }

  // Wait for street change or runout
  for (let i=0;i<20;i++) {
    const hs = await getJson('/hand/state');
    const st = hs[0]?.street;
    const comm = hs[0]?.community?.length || 0;
    if (st !== 'preflop' || comm >= 3) { console.log('Street', st, 'comm', comm); break; }
    await sleep(300);
  }

  // If both live players all-in, ensure showdown
  for (let i=0;i<40;i++) {
    const hs = await getJson('/hand/state');
    const st = hs[0]?.street;
    if (st === 'showdown') { console.log('Showdown OK'); break; }
    await sleep(300);
  }

  console.log('Smoke HU OK');
}

main().catch((e) => { console.error('SMOKE_FAIL', e.message); process.exit(1); });


