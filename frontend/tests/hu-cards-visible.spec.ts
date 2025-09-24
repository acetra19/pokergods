import { test, expect } from '@playwright/test'
import TablePage from './pages/TablePage'

test('Cards are visible at hand start (at least villain backs)', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  // Join via backend
  await pageA.request.post('http://localhost:8080/hu/join/cards_A')
  await pageA.request.post('http://localhost:8080/hu/join/cards_B')

  // Ensure table exists and start a hand
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
  await pageA.request.post('http://localhost:8080/hand/start').catch(()=>{})

  // Open table
  const tableA = new TablePage(pageA)
  await tableA.openTableView()

  // Wait for felt and seat wrappers
  await pageA.waitForSelector('.felt', { timeout: 6000 })
  // wait until at least some hole content is present (backs or fronts)
  await pageA.waitForSelector('.seat .hole-wrap .card-back-sm, .seat .hole-wrap .card-sm', { timeout: 8000 })

  // We don't know the wallet here, so we assert villain backs are visible or at least some cards render
  const villainBacks = pageA.locator('.hole-wrap.villain .card-back-sm')
  const anyFronts = pageA.locator('.hole-wrap .card-sm')
  // At least two backs OR two fronts across seats
  const backsCount = await villainBacks.count()
  const frontsCount = await anyFronts.count()
  expect(backsCount >= 2 || frontsCount >= 2).toBeTruthy()

  await ctx2.close()
})


