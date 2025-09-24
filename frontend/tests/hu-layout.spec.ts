import { test, expect } from '@playwright/test'
import TablePage from './pages/TablePage'

test('HU layout: seats top/bottom centered, no overlap with community/stack', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  // Join direkt über Backend-API (stabiler als UI für Layout-Checks)
  await pageA.request.post('http://localhost:8080/hu/join/layout_A')
  await pageA.request.post('http://localhost:8080/hu/join/layout_B')
  // Warten, bis Tisch existiert und erste Hand läuft (sonst starten)
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
  // Falls Street noch null ist, Hand starten
  const stateRes = await pageA.request.get('http://localhost:8080/hand/state').catch(()=>null)
  if (stateRes && stateRes.ok()) {
    const js: any = await stateRes.json()
    const st = Array.isArray(js) ? js[0] : null
    if (st && (st.street === null || st.community?.length === 0)) {
      await pageA.request.post('http://localhost:8080/hand/start').catch(()=>{})
    }
  }

  const tableA = new TablePage(pageA)
  await tableA.openTableView()
  // Safety: warten bis Felt erscheint (Polling)
  await pageA.waitForSelector('.felt', { timeout: 10000 })

  // Grab bounding boxes
  const felt = pageA.locator('.felt')
  const comm = pageA.locator('.community')
  const stack = pageA.locator('.chip-stack')
  const seats = pageA.locator('.seat')

  await expect(felt).toBeVisible()
  await expect(seats).toHaveCount(2)

  const feltBox = await felt.boundingBox()
  const commBox = await comm.boundingBox()
  const stackBox = await stack.boundingBox()
  const seatBoxes = [await seats.nth(0).boundingBox(), await seats.nth(1).boundingBox()]

  // Seats exist
  expect(seatBoxes[0]).not.toBeNull()
  expect(seatBoxes[1]).not.toBeNull()
  if (!feltBox || !commBox || !stackBox || !seatBoxes[0] || !seatBoxes[1]) return

  // Seats horizontally centered relative to felt
  const feltCenterX = feltBox.x + feltBox.width / 2
  for (const sb of seatBoxes) {
    const seatCenterX = sb.x + sb.width / 2
    expect(Math.abs(seatCenterX - feltCenterX)).toBeLessThanOrEqual(12)
  }

  // One seat near top, one near bottom of felt (sort by y)
  const sorted = seatBoxes.slice().sort((a, b) => a.y - b.y)
  const topSeat = sorted[0]
  const bottomSeat = sorted[1]
  const midY = feltBox.y + feltBox.height / 2
  expect(topSeat.y + topSeat.height).toBeLessThan(midY - 20)
  expect(bottomSeat.y).toBeGreaterThan(midY + 10)

  // No overlap with community or chip stack
  const overlaps = (a: {x:number,y:number,width:number,height:number}, b: {x:number,y:number,width:number,height:number}) => {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
  }
  for (const sb of seatBoxes) {
    expect(overlaps(sb, commBox)).toBeFalsy()
    expect(overlaps(sb, stackBox)).toBeFalsy()
  }

  await ctx2.close()
})


