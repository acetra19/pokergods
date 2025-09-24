import { test, expect } from '@playwright/test'

test('sound smoke: playDeal on hand start and playChip on action change', async ({ page }) => {
  const logs: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('[sound]') || t.includes('[sound-hook]')) logs.push(t)
  })

  await page.goto('/')

  // Join two players via backend
  const A = 'sndA_' + Math.random().toString(36).slice(2,6)
  const B = 'sndB_' + Math.random().toString(36).slice(2,6)
  await page.request.post(`http://localhost:8080/hu/join/${A}`)
  await page.request.post(`http://localhost:8080/hu/join/${B}`)

  // Wait table exists
  let tableId: string | null = null
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const rs = await page.request.get('http://localhost:8080/hand/state').catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      if (Array.isArray(js) && js[0]?.tableId) { tableId = js[0].tableId; break }
    }
    await page.waitForTimeout(150)
  }
  expect(tableId, 'table not created').toBeTruthy()

  // Open table view first so WS/UI hooks are active
  await page.getByRole('button', { name: 'Table' }).click().catch(()=>{})
  await page.waitForSelector('.felt', { timeout: 10000 })

  // Start a hand afterwards (guarantee UI receives hand_start + state)
  await page.request.post('http://localhost:8080/hand/start')

  // Expect playDeal within a short time (allow up to 2s)
  await page.waitForTimeout(1200)
  expect(logs.some(l => l.includes('playDeal'))).toBeTruthy()

  // Fetch current action state
  const asRes = await page.request.get('http://localhost:8080/hand/action_state')
  const as: any[] = await asRes.json()
  const st = Array.isArray(as) ? as[0] : null
  expect(st, 'no action_state').toBeTruthy()

  // Trigger an action that causes a state change -> should fire playChip
  const actor = st.actorPlayerId
  const canCheck = (st.legalActions||[]).includes('check')
  const canCall = (st.legalActions||[]).includes('call')
  if (canCheck) {
    await page.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: actor, type: 'check' } })
  } else if (canCall) {
    await page.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: actor, type: 'call' } })
  }

  await page.waitForTimeout(500)
  expect(logs.some(l => l.includes('playChip')) || logs.some(l => l.includes('chip change'))).toBeTruthy()
})


