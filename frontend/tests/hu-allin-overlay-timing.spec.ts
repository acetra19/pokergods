import { test, expect } from '@playwright/test'

test('All-in overlay appears only after River is visually dealt', async ({ page }) => {
  await page.goto('/')

  const wallet = 'timing_' + Math.random().toString(36).slice(2,8)
  const stateUrl = 'http://localhost:8080/hand/state'
  const actionUrl = 'http://localhost:8080/hand/action'
  const actionStateUrl = 'http://localhost:8080/hand/action_state'
  const overlaySel = '[data-testid="overlay"]'

  await page.route('**/sol/eligibility**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ eligible: true, balance: 125000, threshold: 10000, decimals: 0 })
    })
  })

  await page.getByRole('button', { name: /play now/i }).click()
  await page.waitForURL('**/#/login', { timeout: 10000 })
  await page.getByPlaceholder('username').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByPlaceholder('username').fill('timing-user')
  await page.getByPlaceholder('password').fill('secret123')
  await page.getByPlaceholder(/solana address/i).fill(wallet)
  await page.getByRole('button', { name: /scan/i }).click()
  const continueBtn = page.getByRole('button', { name: /continue/i })
  await continueBtn.waitFor({ state: 'visible', timeout: 5000 })
  await expect(continueBtn).toBeEnabled({ timeout: 5000 })
  await continueBtn.click()
  // enter HU lobby if not already there
  await page.waitForURL('**/#/hu', { timeout: 10000 }).catch(()=>{})
  const playVsBotBtn = page.getByRole('button', { name: /Play vs Bot/i }).first()
  await playVsBotBtn.click()

  await page.waitForURL('**/#/table', { timeout: 15000 }).catch(()=>{})
  await page.waitForSelector('.felt', { timeout: 15000 })

  // Ensure backend knows our seat (fallback in case queue delays)
  let tableId: string | null = null
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const rs = await page.request.get(stateUrl).catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      if (Array.isArray(js) && js[0]?.tableId) {
        tableId = js[0].tableId
        break
      }
    }
    await page.waitForTimeout(200)
  }
  expect(tableId).toBeTruthy()

  // Rig a deterministic runout so we always reach river
  if (tableId) {
    try {
      const state0: any = await (await page.request.get(stateUrl)).json()
      const players: any[] = Array.isArray(state0) && state0[0]?.players ? state0[0].players : []
      const heroSeat = players.find((p) => p.playerId === wallet)?.seatIndex ?? players[0]?.seatIndex ?? 0
      const botSeat = players.find((p) => p.playerId !== wallet)?.seatIndex ?? 1
      await page.request.post('http://localhost:8080/admin/rig', {
        data: {
          tableId,
          holeBySeat: {
            [heroSeat]: [ { suit: 'hearts', rank: 2 }, { suit: 'diamonds', rank: 2 } ],
            [botSeat]: [ { suit: 'spades', rank: 14 }, { suit: 'spades', rank: 13 } ],
          },
          community: [
            { suit: 'spades', rank: 10 },
            { suit: 'spades', rank: 9 },
            { suit: 'spades', rank: 3 },
            { suit: 'spades', rank: 4 },
            { suit: 'spades', rank: 5 }
          ]
        }
      })
      await page.request.post('http://localhost:8080/admin/hu/setStacks', { data: { tableId, stacks: { [wallet]: 300, BOT: 6000 } } })
      await page.request.post('http://localhost:8080/hand/start')
      await page.waitForSelector('.felt', { timeout: 15000 })
    } catch {}
  }

  // already on table view; ensure felt is visible
  await page.waitForSelector('.felt', { timeout: 15000 })

  // Drive the hand to showdown deterministically (hero shoves, villain calls)
  const runoutDeadline = Date.now() + 30000
  let riverSeen = false
  while (Date.now() < runoutDeadline && !riverSeen) {
    const commLen = await page.evaluate(() => document.querySelectorAll('.community .card-md').length)
    if (commLen >= 5) {
      riverSeen = true
      break
    }

    // Guard: overlay must not be visible before river
    const premature = await page.locator(overlaySel).isVisible().catch(()=>false)
    expect(premature && commLen < 5).toBeFalsy()

    const hs = await page.request.get(actionStateUrl).catch(()=>null)
    if (hs && hs.ok()) {
      const arr: any[] = await hs.json()
      const st = arr.find(Boolean)
      if (st && st.tableId === tableId) {
        const actor = st.actorPlayerId
        const legal: string[] = Array.isArray(st.legalActions) ? st.legalActions : []
        const act = async (playerId: string) => {
          const committed = st.committed?.[playerId] ?? 0
          const maxTo = committed + 999999
          if (legal.includes('bet')) {
            await page.request.post(actionUrl, { data: { tableId, playerId, type: 'bet', amount: maxTo } }).catch(()=>{})
          } else if (legal.includes('raise')) {
            await page.request.post(actionUrl, { data: { tableId, playerId, type: 'raise', amount: maxTo } }).catch(()=>{})
          } else if (legal.includes('call')) {
            await page.request.post(actionUrl, { data: { tableId, playerId, type: 'call' } }).catch(()=>{})
          } else if (legal.includes('check')) {
            await page.request.post(actionUrl, { data: { tableId, playerId, type: 'check' } }).catch(()=>{})
          }
        }

        if (actor === wallet) {
          await act(wallet)
        } else if (actor) {
          await act(actor)
        }
        // slight nudge to server in case action_state stalls
        await page.request.post('http://localhost:8080/hand/auto').catch(()=>{})
      }
    }

    await page.waitForTimeout(250)
  }

  if (!riverSeen) {
    // If we somehow never saw the river, force the server to advance and re-evaluate once
    await page.request.post('http://localhost:8080/hand/auto').catch(()=>{})
    await page.waitForTimeout(1500)
    riverSeen = await page.evaluate(() => document.querySelectorAll('.community .card-md').length >= 5)
  }

  expect(riverSeen).toBeTruthy()
  await page.waitForFunction(() => document.querySelectorAll('.community .card-md').length >= 5, null, { timeout: 5000 })

  // Now overlay should appear (with generous delay slack)
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 7000 })
})


