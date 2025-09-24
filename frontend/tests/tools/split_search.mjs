import fs from 'fs/promises'

const BASE = process.env.BASE || 'http://localhost:8080'

async function req(path, opts={}) {
  const r = await fetch(BASE + path, opts).catch(()=>null)
  if (!r || !r.ok) throw new Error(`${opts.method||'GET'} ${path} ${r?.status||'nores'}`)
  try { return await r.json() } catch { return {} }
}

function uniq(arr) { return Array.from(new Set(arr)) }

async function main() {
  // Speed up decisions to accelerate splits discovery
  try { await req(`/admin/timing?primaryMs=300&bankMs=0`, { method:'POST' }) } catch {}

  // Join a bunch of wallets
  const wallets = Array.from({ length: 10 }).map((_,i)=> `SPLIT_${i+1}_${Math.random().toString(36).slice(2,6)}`)
  for (const w of wallets) { try { await req(`/hu/join/${encodeURIComponent(w)}`, { method:'POST' }) } catch {} }

  const seen = new Set()
  const histories = []
  let splits = 0
  const targetHands = Number(process.env.TARGET || 200)
  const deadline = Date.now() + Number(process.env.TIMEOUT_MS || 6*60_000)

  while (seen.size < targetHands && Date.now() < deadline) {
    const hist = await req('/hand/history').catch(()=>[])
    for (const h of hist) {
      const key = `${h.tableId}:${h.handNumber}`
      if (seen.has(key)) continue
      seen.add(key)
      histories.push(h)
      if (Array.isArray(h.winners) && h.winners.length > 1) splits += 1
    }
    await new Promise(r=>setTimeout(r, 200))
  }

  await fs.mkdir('playwright-report', { recursive: true })
  await fs.writeFile('playwright-report/split_search_history.json', JSON.stringify({ count: seen.size, splits, histories }, null, 2))
  console.log(JSON.stringify({ hands: seen.size, splits }, null, 2))
}

main().catch((e)=>{ console.error('SPLIT_FAIL', e.message); process.exit(1) })


