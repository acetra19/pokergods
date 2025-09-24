const BASE = process.env.BASE || 'http://localhost:8080'

async function j(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null)
  if (!r || !r.ok) {
    const txt = r ? await r.text().catch(()=>'') : 'no response'
    throw new Error(`${method} ${path} failed ${r?.status||''} ${txt.slice(0,120)}`)
  }
  try { return await r.json() } catch { return {} }
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)) }

async function ensureTable() {
  // join two wallets if needed
  const A = 'RIG_A_' + Math.random().toString(36).slice(2,6)
  const B = 'RIG_B_' + Math.random().toString(36).slice(2,6)
  await j(`/hu/join/${encodeURIComponent(A)}`, 'POST').catch(()=>{})
  await j(`/hu/join/${encodeURIComponent(B)}`, 'POST').catch(()=>{})
  // wait for table
  for (let i=0;i<40;i++) {
    const hs = await j('/hand/state').catch(()=>[])
    if (Array.isArray(hs) && hs[0]?.tableId) return hs[0].tableId
    await sleep(200)
  }
  throw new Error('no table created')
}

async function run() {
  const tableId = await ensureTable()
  // Rig holes and board: AT vs A9 on AKKQ8 (split)
  await j('/admin/rig','POST',{
    tableId,
    holeBySeat: {
      0: [{ suit:'spades', rank:14 }, { suit:'hearts', rank:10 }], // A♠ T♥
      1: [{ suit:'clubs', rank:14 }, { suit:'diamonds', rank:9 }], // A♣ 9♦
    },
    community: [
      { suit:'spades', rank:14 }, // A♠
      { suit:'clubs',  rank:13 }, // K♣
      { suit:'hearts', rank:13 }, // K♥
      { suit:'diamonds', rank:12 }, // Q♦
      { suit:'clubs',  rank:8 },  // 8♣
    ],
  })
  // start next hand to apply rig
  await j('/hand/start','POST')
  // drive to showdown quickly: shove + call
  let as = (await j('/hand/action_state')).find(x=>x) || null
  if (!as) throw new Error('no action_state after start')
  const actor = as.actorPlayerId
  const hs0 = (await j('/hand/state'))[0]
  const actorChips = (hs0.players.find(p=>p.playerId===actor)||{}).chips || 0
  const committed = as.committed?.[actor] || 0
  const amount = committed + actorChips
  const type = as.legalActions.includes('bet') ? 'bet' : 'raise'
  await j('/hand/action','POST',{ tableId, playerId: actor, type, amount })
  await sleep(150)
  as = (await j('/hand/action_state')).find(x=>x) || null
  if (as) {
    await j('/hand/action','POST',{ tableId, playerId: as.actorPlayerId, type:'call' })
  }
  // wait for showdown
  for (let i=0;i<40;i++) {
    const st = (await j('/hand/state'))[0]
    if (st && st.street === 'showdown') {
      const w = st.lastWinners || []
      console.log(JSON.stringify({ winners:w, community: st.community, players: st.players.map(p=>({id:p.playerId, chips:p.chips})) }, null, 2))
      // quick check
      const ok = Array.isArray(w) && w.length === 2 && w[0].amount === w[1].amount
      if (!ok) process.exitCode = 1
      return
    }
    await sleep(200)
  }
  throw new Error('no showdown reached')
}

run().catch((e)=>{ console.error('RIG_SPLIT_FAIL', e.message); process.exit(1) })


