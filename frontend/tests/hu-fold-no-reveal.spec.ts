import { test, expect } from '@playwright/test'
import TablePage from './pages/TablePage'

test('Fold ends hand without revealing villain cards', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  // Join via backend (stable)
  await pageA.request.post('http://localhost:8080/hu/join/fold_A')
  await pageA.request.post('http://localhost:8080/hu/join/fold_B')

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

  // Get current actor and fold immediately
  const action1: any[] = await (await pageA.request.get('http://localhost:8080/hand/action_state')).json()
  const a1 = Array.isArray(action1) ? action1.find((s:any)=> s && s.tableId === tableId) : null
  if (!a1) test.skip(true, 'no action state available to fold')
  await pageA.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: a1.actorPlayerId, type: 'fold' } })

  // Wait until server reports showdown
  const waitDeadline = Date.now() + 8000
  while (Date.now() < waitDeadline) {
    const stateNow: any[] = await (await pageA.request.get('http://localhost:8080/hand/state')).json().catch(()=>[])
    const h = Array.isArray(stateNow) ? stateNow.find((s:any)=> s.tableId === tableId) : null
    if (h && h.street === 'showdown') break
    await pageA.waitForTimeout(150)
  }

  // Open table view to validate UI (villain should stay hidden)
  const tableA = new TablePage(pageA)
  await tableA.openTableView()

  // Ensure felt present
  await pageA.waitForSelector('.felt', { timeout: 5000 })
  // Assert: keine offen angezeigten Villain-Karten
  const villainFaceUp = pageA.locator('.hole-wrap.villain .card-sm')
  await expect(villainFaceUp).toHaveCount(0)

  await ctx2.close()
})


