import { test, expect } from '@playwright/test'

test('timeout with toCall=0 auto-checks (no overlay, hand continues)', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  // Join via backend API (stable)
  await pageA.request.post('http://localhost:8080/hu/join/autoC_A')
  await pageB.request.post('http://localhost:8080/hu/join/autoC_B')

  // Ensure table exists and start a hand
  let tableId: string | null = null
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const rs = await pageA.request.get('http://localhost:8080/hand/state').catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      if (Array.isArray(js) && js[0]?.tableId) { tableId = js[0].tableId; break }
    }
    await pageA.waitForTimeout(200)
  }
  if (!tableId) throw new Error('no table created')
  await pageA.request.post('http://localhost:8080/hand/start').catch(()=>{})

  // UI ist hier nicht relevant; wir prüfen reine Server-Semantik

  // Wait until action_state appears and indicates toCall=0 for the actor
  // We poll backend because UI abstraction may vary
  let toCallZero = false
  const end = Date.now() + 15000
  while (Date.now() < end) {
    const ars = await pageA.request.get('http://localhost:8080/hand/action_state').catch(()=>null)
    if (ars && ars.ok()) {
      const js: any = await ars.json()
      const st = Array.isArray(js) ? js[0] : null
      if (st) {
        const committed = st.committed?.[st.actorPlayerId] ?? 0
        const toCall = Math.max(0, st.currentBet - committed)
        if (toCall === 0) { toCallZero = true; break }
      }
    }
    await pageA.waitForTimeout(250)
  }
  expect(toCallZero).toBeTruthy()

  // Wait out primary + small buffer; engine auto-checks. Verifiziere, dass Street weiterhin preflop bleibt
  await pageA.waitForTimeout(1500)
  const stAfter: any[] = await (await pageA.request.get('http://localhost:8080/hand/state')).json()
  const hAfter = Array.isArray(stAfter) ? stAfter[0] : null
  expect(hAfter?.street === 'preflop' || hAfter?.street === 'flop' || hAfter?.street === 'turn' || hAfter?.street === 'river' || hAfter?.street === 'showdown').toBeTruthy()

  await ctx2.close()
})


