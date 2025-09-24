import { test, expect } from '@playwright/test'

function overlaps(a: { x:number, y:number, width:number, height:number }|null, b: { x:number, y:number, width:number, height:number }|null) {
  if (!a || !b) return false
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
}

test('HU visual: hero cards visible, villain backs, no overlap/timepill, no deck', async ({ page, context }) => {
  // Arrange: start frontend preview (handled by config) and join HU match via backend API
  await page.goto('/')
  const A = 'visA_' + Math.random().toString(36).slice(2,6)
  const B = 'visB_' + Math.random().toString(36).slice(2,6)
  await page.request.post(`http://localhost:8080/hu/join/${A}`)
  await page.request.post(`http://localhost:8080/hu/join/${B}`)

  // Wait for table and first state
  let tableId: string | null = null
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const rs = await page.request.get('http://localhost:8080/hand/state').catch(()=>null)
    if (rs && rs.ok()) {
      const js: any = await rs.json()
      const t = Array.isArray(js) ? (js[0]?.tableId || null) : null
      if (t) { tableId = t; break }
    }
    await page.waitForTimeout(200)
  }
  expect(tableId, 'table not created').toBeTruthy()

  // Go to Table view
  await page.getByRole('button', { name: 'Table' }).click()
  await page.waitForSelector('.felt', { timeout: 10000 })

  // Assert deck-stack is not present
  await expect(page.locator('.deck-stack')).toHaveCount(0)

  // Identify seats and hero/villain
  const seats = page.locator('.seat')
  // wait until both seats render
  await expect(seats).toHaveCount(2, { timeout: 8000 })
  const s0 = seats.nth(0)
  const s1 = seats.nth(1)
  const hole0 = s0.locator('.hole-wrap .card-sm')
  const hole1 = s1.locator('.hole-wrap .card-sm')
  const backs0 = s0.locator('.hole-wrap .card-back-sm')
  const backs1 = s1.locator('.hole-wrap .card-back-sm')

  // One seat must show 2 hero cards, the other 2 backs
  // wait tolerantly for hero cards to render
  await page.waitForTimeout(300)
  const heroIs0 = (await hole0.count()) === 2
  const heroSeat = heroIs0 ? s0 : s1
  const villainSeat = heroIs0 ? s1 : s0
  await expect(heroSeat.locator('.hole-wrap .card-sm')).toHaveCount(2)
  await expect(villainSeat.locator('.hole-wrap .card-back-sm')).toHaveCount(2)

  // Time-pill should not overlap hero hole cards
  const heroHoleBox = await heroSeat.locator('.hole-wrap').boundingBox()
  const timePillBox = await heroSeat.locator('.time-pill').boundingBox()
  expect(overlaps(heroHoleBox, timePillBox)).toBeFalsy()

  // Action panel should not overlap hero seat (sits below)
  const actionBox = await page.locator('.action-panel').boundingBox()
  const heroSeatBox = await heroSeat.boundingBox()
  if (actionBox && heroSeatBox) {
    expect(actionBox.y).toBeGreaterThan(heroSeatBox.y + heroSeatBox.height - 8)
  }
})


