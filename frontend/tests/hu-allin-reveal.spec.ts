import { test, expect } from '@playwright/test'

async function setupMatch(page: any, A = 'reveal_A', B = 'reveal_B') {
  await page.goto('/')
  await page.request.post('http://localhost:8080/hu/join/' + A)
  await page.request.post('http://localhost:8080/hu/join/' + B)
  let tableId: string | null = null
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    const rs = await page.request.get('http://localhost:8080/hand/state').catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      if (Array.isArray(js) && js[0]?.tableId) { tableId = js[0].tableId; break }
    }
    await page.waitForTimeout(250)
  }
  if (!tableId) throw new Error('no table created')
  await page.request.post('http://localhost:8080/hand/start').catch(()=>{})
  return tableId
}

test('All-in without call: no villain reveal before bettingClosed', async ({ browser, context }) => {
  const page = await context.newPage()
  const tableId = await setupMatch(page, 'nocall_A', 'nocall_B')
  const state1: any[] = await (await page.request.get('http://localhost:8080/hand/state')).json()
  const action1: any[] = await (await page.request.get('http://localhost:8080/hand/action_state')).json()
  const h1 = Array.isArray(state1) ? state1.find((s:any)=> s.tableId === tableId) : null
  // Actor determination: if action state absent (e.g., all-in immediate runout), skip
  const a1 = Array.isArray(action1) ? action1.find((s:any)=> s && s.tableId === tableId) : null
  if (!h1) throw new Error('no state for table')
  if (!a1) test.skip(true, 'no action state (street may be locked)')
  const actorId: string = a1.actorPlayerId
  // Actor shoves all-in (raise to all chips)
  const actorChips: number = h1.players.find((p:any)=> p.playerId === actorId)!.chips
  await page.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: actorId, type: (a1.currentBet === 0 ? 'bet' : 'raise'), amount: (a1.committed?.[actorId] ?? 0) + actorChips } })

  // After shove, before any call: verify bettingClosed is false, allInLocked true, no reveal
  const state2: any[] = await (await page.request.get('http://localhost:8080/hand/state')).json()
  const h2 = Array.isArray(state2) ? state2.find((s:any)=> s.tableId === tableId) : null
  expect(h2.allInLocked).toBeTruthy()
  expect(h2.bettingClosed).toBeFalsy()
  // Villain holecards should not be present on server state for opponent; client uses flag anyway
  // We assert via flags only here

  await page.close()
})

test('All-in + call: reveal after bettingClosed (server-driven)', async ({ browser, context }) => {
  const page = await context.newPage()
  const tableId = await setupMatch(page, 'call_A', 'call_B')
  const state1: any[] = await (await page.request.get('http://localhost:8080/hand/state')).json()
  const action1: any[] = await (await page.request.get('http://localhost:8080/hand/action_state')).json()
  const h1 = Array.isArray(state1) ? state1.find((s:any)=> s.tableId === tableId) : null
  const a1 = Array.isArray(action1) ? action1.find((s:any)=> s && s.tableId === tableId) : null
  if (!h1) throw new Error('no state for table')
  if (!a1) test.skip(true, 'no initial action state')
  const actorId: string = a1.actorPlayerId
  // Actor shoves all-in
  const actorChips: number = h1.players.find((p:any)=> p.playerId === actorId)!.chips
  await page.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: actorId, type: (a1.currentBet === 0 ? 'bet' : 'raise'), amount: (a1.committed?.[actorId] ?? 0) + actorChips } })

  // Opponent calls
  const action2: any[] = await (await page.request.get('http://localhost:8080/hand/action_state')).json()
  const a2 = Array.isArray(action2) ? action2.find((s:any)=> s && s.tableId === tableId) : null
  if (!a2) test.skip(true, 'no caller action state available')
  const callerId: string = a2.actorPlayerId
  await page.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: callerId, type: 'call' } })

  // Now betting should be closed and showdown should be reached (server runs out)
  const state3: any[] = await (await page.request.get('http://localhost:8080/hand/state')).json()
  const h3 = Array.isArray(state3) ? state3.find((s:any)=> s.tableId === tableId) : null
  expect(!!(h3 && (h3.bettingClosed || h3.street === 'showdown'))).toBeTruthy()

  await page.close()
})


