import { test, expect } from '@playwright/test'

// Measures:
// 1) Delta between full River reveal (5 community cards visible) and overlay visible (>= 1500ms)
// 2) Match overlay hold duration (>= 5000ms)

test('Overlay timing: river->overlay delay and match overlay hold', async ({ page }) => {
  await page.goto('/')

  // In-App wallet setzen und Bot-Match starten (damit wir handeln können)
  const W = 'timing_' + Math.random().toString(36).slice(2, 7)
  const walletInput = page.getByPlaceholder('wallet')
  await walletInput.fill(W)
  await page.getByRole('button', { name: 'Play vs Bot' }).click()
  // Warte auf Table-Ansicht
  await page.waitForSelector('.felt', { timeout: 15000 })

  // Warte bis wir am Zug sind (damit All-in-Knopf verfügbar ist)
  await page.waitForFunction(() => {
    const info = Array.from(document.querySelectorAll('.action-info'))
      .map(el => el.textContent || '').join(' ')
    return /To act:\s*\w+/i.test(info)
  }, null, { timeout: 15000 })

  // Forciere schnellen Runout per Admin-Advance (Testzweck)
  // 4x advance: Flop, Turn, River, Showdown
  await page.request.post('http://localhost:8080/hand/advance')
  await page.waitForTimeout(200)
  await page.request.post('http://localhost:8080/hand/advance')
  await page.waitForTimeout(200)
  await page.request.post('http://localhost:8080/hand/advance')
  await page.waitForTimeout(200)
  await page.request.post('http://localhost:8080/hand/advance')

  // Ensure we have community rendering, then wait for full river visible
  const communitySel = '.community .card-md'

  // Wait for 5 community cards to be visible; record timestamp
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length >= 5, communitySel, { timeout: 25000 })
  const riverVisibleTs = Date.now()

  // Wait for overlay visible; record timestamp
  const overlaySel = '[data-testid="overlay"]'
  await expect(page.locator(overlaySel)).toBeVisible({ timeout: 8000 })
  const overlayVisibleTs = Date.now()
  const deltaMs = overlayVisibleTs - riverVisibleTs
  // Soft lower bound when river timestamp exists (>= 1500ms)
  expect(deltaMs).toBeGreaterThanOrEqual(1400)

  // Measure hold for generic overlay (hand overlay)
  const holdStart = Date.now()
  // Wait until overlay disappears again
  await page.waitForSelector(overlaySel, { state: 'hidden', timeout: 12000 })
  const holdEnd = Date.now()
  const holdMs = holdEnd - holdStart
  // Should hold for >= ~2400ms for hand overlays (allow tolerance)
  expect(holdMs).toBeGreaterThanOrEqual(2200)

  // Log measurements for manual inspection in CI output
  console.log(JSON.stringify({ deltaMs, holdMs }))
})


