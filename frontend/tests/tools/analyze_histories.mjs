import fs from 'fs/promises'

function uniq(arr) { return Array.from(new Set(arr)) }

function summarize(histories) {
  const byTable = new Map()
  for (const h of histories) {
    if (!byTable.has(h.tableId)) byTable.set(h.tableId, [])
    byTable.get(h.tableId).push(h)
  }
  const issues = []
  const tables = []
  for (const [tableId, list] of byTable) {
    list.sort((a,b)=> (a.handNumber||0)-(b.handNumber||0))
    const hands = list.map(h=>h.handNumber)
    // uniqueness
    if (uniq(hands).length !== hands.length) issues.push({ tableId, type:'duplicate_hand_numbers', details: hands })
    // monotonic
    for (let i=1;i<hands.length;i++) if (hands[i] <= hands[i-1]) issues.push({ tableId, type:'non_monotonic', at: hands[i] })
    // chip sum constant
    const sum0 = (list[0]?.players||[]).reduce((s,p)=> s + (p.chips||0), 0)
    for (const h of list) {
      const sum = (h.players||[]).reduce((s,p)=> s + (p.chips||0), 0)
      if (sum !== sum0) issues.push({ tableId, type:'chip_sum_mismatch', hand: h.handNumber, sum, sum0 })
      for (const p of (h.players||[])) {
        if (p.chips < 0) issues.push({ tableId, type:'negative_chips', hand: h.handNumber, playerId: p.playerId, chips: p.chips })
      }
      // winners subset of players
      const playerIds = new Set((h.players||[]).map(p=>p.playerId))
      for (const w of (h.winners||[])) {
        if (!playerIds.has(w.playerId)) issues.push({ tableId, type:'winner_not_in_players', hand: h.handNumber, winner: w.playerId })
        if ((w.amount||0) <= 0) issues.push({ tableId, type:'non_positive_win', hand: h.handNumber, winner: w.playerId, amount: w.amount })
      }
    }
    tables.push({ tableId, hands: list.length, start: hands[0], end: hands[hands.length-1] })
  }
  return { tables, issues }
}

async function main() {
  const path = 'playwright-report/hu_load_history.json'
  const raw = await fs.readFile(path, 'utf-8')
  const data = JSON.parse(raw)
  const histories = Array.isArray(data.histories) ? data.histories : []
  const { tables, issues } = summarize(histories)
  const report = { completed: data.completed, tables, issueCount: issues.length, issues }
  await fs.writeFile('playwright-report/hu_load_analysis.json', JSON.stringify(report, null, 2))
  console.log('HU load analysis:', JSON.stringify({ completed: data.completed, tables: tables.length, issues: issues.length }, null, 2))
}

main().catch((e)=>{ console.error('ANALYSIS_FAIL', e); process.exit(1) })


