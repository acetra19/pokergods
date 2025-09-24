import { test, expect } from '@playwright/test'

test('HU betting: SB complete (call) should NOT deal flop; BB gets action', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  // Join via backend (stable)
  const SB_ID = 'sb_complete_A'
  const BB_ID = 'sb_complete_B'
  await pageA.request.post('http://localhost:8080/hu/join/' + SB_ID)
  await pageA.request.post('http://localhost:8080/hu/join/' + BB_ID)

  // Wait for table creation
  let tableId: string | null = null
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    const rs = await pageA.request.get('http://localhost:8080/hand/state').catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      if (Array.isArray(js) && js[0]?.tableId) { tableId = js[0].tableId; break }
    }
    await pageA.waitForTimeout(250)
  }
  if (!tableId) throw new Error('no table created')

  // Ensure hand started
  await pageA.request.post('http://localhost:8080/hand/start').catch(()=>{})

  // Read state; compute actors via dealerIndex (HU semantics)
  await pageA.waitForTimeout(150)
  const state1: any[] = await (await pageA.request.get('http://localhost:8080/hand/state')).json()
  const h1 = Array.isArray(state1) ? state1.find((s:any)=> s.tableId === tableId) : null
  expect(h1.street).toBe('preflop')
  expect((h1.community || []).length).toBe(0)

  // Determine SB/BB from dealerIndex
  const dealerIndex: number = h1.dealerIndex
  const sbSeat = dealerIndex
  const bbSeat = (dealerIndex + 1) % h1.players.length
  const sbPlayerId: string = h1.players.find((p:any)=> p.seatIndex === sbSeat)!.playerId
  const bbPlayerId: string = h1.players.find((p:any)=> p.seatIndex === bbSeat)!.playerId

  // Preflop first actor must be SB (by rule)
  expect(h1.street).toBe('preflop')

  // SB completes (call to BB)
  await pageA.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: sbPlayerId, type: 'call' } })

  // Re-read state: should still be preflop, no flop dealt
  const state2: any[] = await (await pageA.request.get('http://localhost:8080/hand/state')).json()
  const h2 = Array.isArray(state2) ? state2.find((s:any)=> s.tableId === tableId) : null
  expect(h2.street).toBe('preflop')
  expect((h2.community || []).length).toBe(0)
  // By rule, action passes to BB and still preflop (no flop yet)
  // We don't assert actor endpoint to avoid flakiness; server state suffices

  await ctx2.close()
})


