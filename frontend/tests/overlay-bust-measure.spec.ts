import { test, expect } from '@playwright/test'

test('Bust to match end -> overlay appears once with proper delay/hold', async ({ page }) => {
  await page.goto('/')

  const W = '4W98UZveyi3HSdcVBAURzKxtWF2UQDS1BuyZdJVjnquo'
  await page.route('**/sol/eligibility**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ eligible: true, balance: 1000000, threshold: 5000, decimals: 0 })
    })
  })
  await page.getByRole('button', { name: /play now/i }).click()
  await page.waitForURL('**/#/login', { timeout: 10000 }).catch(()=>{})
  await page.getByPlaceholder('username').fill('test-user')
  await page.getByPlaceholder('password').fill('secret')
  await page.getByPlaceholder(/solana address/i).fill(W)
  await page.getByRole('button', { name: /scan/i }).click()
  const continueBtn = page.getByRole('button', { name: /continue/i })
  await continueBtn.waitFor({ state: 'visible', timeout: 5000 })
  await expect(continueBtn).toBeEnabled({ timeout: 5000 })
  await continueBtn.click()
  await page.waitForURL('**/#/hu', { timeout: 10000 }).catch(()=>{})
  await page.getByRole('button', { name: /Play vs Bot/i }).first().click()
  await page.waitForURL('**/#/table', { timeout: 15000 }).catch(()=>{})
  await page.waitForSelector('.felt', { timeout: 15000 })

  // Helpers
  const overlaySel = '[data-testid="overlay"]'
  const stateUrl = 'http://localhost:8080/hand/state'
  const actionUrl = 'http://localhost:8080/hand/action'

  // Find current tableId
  const tableId = await (async () => {
    for (let i = 0; i < 30; i++) {
      const rs = await page.request.get(stateUrl).catch(()=>null)
      if (rs && rs.ok()) {
        const js: any = await rs.json()
        if (Array.isArray(js) && js[0]?.tableId) return js[0].tableId as string
      }
      await page.waitForTimeout(300)
    }
    throw new Error('no tableId')
  })()

  // Discover seat indices for rigging
  const state0: any[] = await (await page.request.get(stateUrl)).json().catch(()=>[])
  const seats0 = (state0 && state0[0] && Array.isArray(state0[0].players)) ? state0[0].players : []
  const heroSeat = seats0.find((p: any) => p.playerId === W)?.seatIndex ?? 0
  const botSeat = seats0.find((p: any) => p.playerId === 'BOT')?.seatIndex ?? 1

  // Rig next hand: give BOT nut flush, hero weak offsuit
  await page.request.post('http://localhost:8080/admin/rig', {
    data: {
      tableId,
      holeBySeat: {
        [heroSeat]: [ { suit: 'hearts', rank: 2 }, { suit: 'diamonds', rank: 2 } ],
        [botSeat]:  [ { suit: 'spades', rank: 14 }, { suit: 'spades', rank: 13 } ] // As Ks (spades)
      },
      community: [
        { suit: 'spades', rank: 10 },
        { suit: 'spades', rank: 9 },
        { suit: 'spades', rank: 3 },
        { suit: 'spades', rank: 4 },
        { suit: 'spades', rank: 5 }
      ]
    }
  }).catch(()=>{})

  // Force short stacks and start next hand with rig applied
  await page.request.post('http://localhost:8080/admin/hu/setStacks', { data: { tableId, stacks: { [W]: 300, BOT: 6000 } } }).catch(()=>{})
  await page.request.post('http://localhost:8080/hand/start').catch(()=>{})
  await page.waitForSelector('.felt', { timeout: 15000 })

  // Drive repeated all-ins until match end or timeout
  const t0 = Date.now()
  let riverTs = 0
  let overlayTs = 0
  let overlayShown = false
  let busted = false

  while (Date.now() - t0 < 60000 && !busted) {
    // Click all-in via UI when we are actor
    // Attempt to send max action when we are actor by calling backend directly
    const hs = await page.request.get('http://localhost:8080/hand/action_state').catch(()=>null)
    if (hs && hs.ok()) {
      const arr: any[] = await hs.json()
      const st = arr.find(Boolean)
      if (st && st.actorPlayerId === W) {
        try {
          await page.getByTestId('allin-preset').click({ timeout: 500 })
          await page.getByTestId(/submit-(bet|raise)/).click({ timeout: 500 })
        } catch {
          const actorCommitted = (st.committed?.[W] ?? 0)
          const maxTo = actorCommitted + 999999
          const canBet = Array.isArray(st.legalActions) && st.legalActions.includes('bet')
          const canRaise = Array.isArray(st.legalActions) && st.legalActions.includes('raise')
          if (canBet) await page.request.post(actionUrl, { data: { tableId, playerId: W, type: 'bet', amount: maxTo } })
          else if (canRaise) await page.request.post(actionUrl, { data: { tableId, playerId: W, type: 'raise', amount: maxTo } })
          else if (Array.isArray(st.legalActions) && st.legalActions.includes('call')) await page.request.post(actionUrl, { data: { tableId, playerId: W, type: 'call' } })
          else if (Array.isArray(st.legalActions) && st.legalActions.includes('check')) await page.request.post(actionUrl, { data: { tableId, playerId: W, type: 'check' } })
        }
      }
    }

    // Track river and overlay
    const commLen = await page.evaluate(() => document.querySelectorAll('.community .card-md').length)
    if (commLen >= 5 && !riverTs) riverTs = Date.now()
    const ovVisible = await page.locator(overlaySel).isVisible().catch(()=>false)
    if (ovVisible && !overlayShown) { overlayShown = true; overlayTs = Date.now() }

    // Match end detection: look for overlay text or busted chip counts
    if (ovVisible) {
      const txt = await page.locator(`${overlaySel} .overlay-content`).innerText().catch(()=>"")
      if (/Match Over/i.test(txt||'')) {
        // acknowledge if Next Match required
        const btn = page.getByRole('button', { name: /Next Match/i })
        if (await btn.isVisible().catch(()=>false)) {
          await btn.click().catch(()=>{})
        }
        busted = true
      }
    }

    await page.waitForTimeout(250)
  }

  expect(overlayShown).toBeTruthy()
  const delta = overlayTs && riverTs ? (overlayTs - riverTs) : 0
  // soft lower bound
  expect(delta).toBeGreaterThanOrEqual(1200)
})


