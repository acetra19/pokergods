import { test, expect } from '@playwright/test'
import fs from 'fs/promises'

async function api(page: any, method: 'GET'|'POST', path: string, body?: any) {
  const r = await page.request.fetch(`http://localhost:8080${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body ? JSON.stringify(body) : undefined,
  }).catch(() => null)
  if (!r || !r.ok()) throw new Error(`${method} ${path} failed`)
  try { return await r.json() } catch { return {} }
}

test.setTimeout(5 * 60 * 1000)

test('HU load: 11 clients, 100 matches, collect histories', async ({ browser, context }) => {
  // Spawn 11 clients (11 contexts)
  const contexts = [context]
  while (contexts.length < 11) contexts.push(await browser.newContext())
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()))

  // Open UI only on the first page to save resources/videos
  await pages[0].goto('/')
  for (let i = 1; i < pages.length; i++) { await pages[i].goto('/').catch(()=>{}) }

  // Join 10 clients into HU queue (leave one idle)
  const wallets: string[] = Array.from({ length: 10 }).map((_, i) => `LOAD_${i + 1}_${Math.random().toString(36).slice(2,6)}`)
  for (let i = 0; i < 10; i++) {
    await api(pages[i], 'POST', `/hu/join/${encodeURIComponent(wallets[i])}`)
  }

  // Wait for a table to exist
  let tableId: string | null = null
  const startDeadline = Date.now() + 10000
  while (Date.now() < startDeadline) {
    const hs: any = await api(pages[0], 'GET', '/hand/state').catch(()=>[])
    if (Array.isArray(hs) && hs[0]?.tableId) { tableId = hs[0].tableId; break }
    await pages[0].waitForTimeout(200)
  }
  expect(tableId, 'no table created').toBeTruthy()

  // Run until we observe 100 completed hands across tables
  let completed = 0
  const histories: any[] = []
  const seenHands = new Set<string>()

  const deadline = Date.now() + 4 * 60 * 1000
  while (completed < 100 && Date.now() < deadline) {
    // poll histories (merged) and count unique handNumbers per table
    const hist: any[] = await api(pages[0], 'GET', '/hand/history').catch(()=>[])
    for (const h of hist) {
      const key = `${h.tableId}:${h.handNumber}`
      if (!seenHands.has(key)) {
        seenHands.add(key)
        histories.push(h)
        completed += 1
      }
    }
    if (completed >= 100) break
    await pages[0].waitForTimeout(300)
  }

  // Persist histories for inspection
  await fs.mkdir('playwright-report', { recursive: true })
  await fs.writeFile('playwright-report/hu_load_history.json', JSON.stringify({ completed, histories }, null, 2))

  expect(completed).toBeGreaterThanOrEqual(100)

  // cleanup
  for (let i = 1; i < contexts.length; i++) await contexts[i].close()
})


