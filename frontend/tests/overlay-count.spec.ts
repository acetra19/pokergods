import { test } from '@playwright/test'

test('Overlay count sampling over 30s', async ({ page }) => {
  await page.goto('/')

  // Start HU vs Bot via UI
  const W = 'probe_' + Math.random().toString(36).slice(2, 7)
  await page.getByPlaceholder('wallet').fill(W)
  await page.getByRole('button', { name: 'Play vs Bot' }).click()
  await page.waitForSelector('.felt', { timeout: 15000 })

  const overlaySel = '[data-testid="overlay"]'
  const samples: Array<{ t:number; n:number }> = []
  const start = Date.now()
  const until = start + 30000
  let lastN = -1
  let rises = 0
  let maxN = 0

  while (Date.now() < until) {
    const n = await page.evaluate((sel)=> document.querySelectorAll(sel).length, overlaySel)
    samples.push({ t: Date.now() - start, n })
    if (n > lastN) rises += 1
    if (n > maxN) maxN = n
    lastN = n
    await page.waitForTimeout(250)
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ maxOverlays: maxN, rises, samples: samples.slice(0, 5).concat(samples.slice(-5)) }))
})


