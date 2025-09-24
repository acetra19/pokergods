/* Headless E2E: actor times out → auto-check/fold; actor switches; hand progresses */
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
  const A = 'TimeoutA_' + Math.random().toString(36).slice(2,7);
  const B = 'TimeoutB_' + Math.random().toString(36).slice(2,7);
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
  // shorten timing for deterministic test (apply AFTER engine exists)
  await postJson('/admin/timing?primaryMs=2000&bankMs=0');
  // fetch initial actor
  let as = null;
  for (let i=0;i<20;i++) {
    const list = await getJson('/hand/action_state');
    as = (Array.isArray(list) ? list.find((s) => s && s.tableId === tableId) : null) || null;
    if (as && as.actorPlayerId) break;
    await sleep(200);
  }
  if (!as) throw new Error('no action state');
  const firstActor = as.actorPlayerId;
  // Wait until timeout causes either actor switch OR hand progress (street change or showdown)
  for (let i=0;i<100;i++) {
    const [list, hs] = await Promise.all([
      getJson('/hand/action_state').catch(()=>[]),
      getJson('/hand/state').catch(()=>[])
    ]);
    const st = (Array.isArray(list) ? list.find((s) => s && s.tableId === tableId) : null) || null;
    const me = (Array.isArray(hs) ? hs.find((h) => h && h.tableId === tableId) : null) || null;
    const street = me?.street;
    if (street === 'showdown' || (street && street !== 'preflop')) { console.log('TIMEOUT_OK'); return; }
    if (st && st.actorPlayerId && st.actorPlayerId !== firstActor) { console.log('TIMEOUT_OK'); return; }
    await sleep(1000);
  }
  throw new Error('actor did not switch after timeout');
}

main().catch((e) => { console.error('TIMEOUT_FAIL', e.message); process.exit(1) })


