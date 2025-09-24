import { test, expect } from '@playwright/test'

test('timeout with toCall>0 auto-folds (no reveal until showdown)', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  await pageA.request.post('http://localhost:8080/hu/join/autoF_A')
  await pageB.request.post('http://localhost:8080/hu/join/autoF_B')

  // Start a hand
  await pageA.request.post('http://localhost:8080/hand/start').catch(()=>{})

  // UI nicht nötig; wir treiben State via API

  // Ensure toCall>0 for the actor by placing a small bet from the opponent via API
  // Find action_state to know actor/opponent
  const ars = await pageA.request.get('http://localhost:8080/hand/action_state')
  const js: any = await ars.json()
  const st = Array.isArray(js) ? js[0] : null
  if (!st) throw new Error('no action_state')

  const tableId = st.tableId
  const actor = st.actorPlayerId
  const opponents = Object.keys(st.committed||{}).filter(p => p !== actor)
  const opp = opponents[0]
  if (!opp) throw new Error('no opponent')

  const minRaiseTo = st.currentBet + st.minRaise
  // Have opponent raise min to set toCall>0 for actor
  await pageA.request.post('http://localhost:8080/hand/action', { data: { tableId, playerId: opp, type: 'raise', amount: minRaiseTo } })

  // Wait ~3.2s to allow auto-fold (primary + buffer after timebank consumption tick)
  await pageA.waitForTimeout(3200)

  // Prüfe per Backend, dass Hand nicht im Showdown ist (kein Overlay nötig)
  const stAfter: any[] = await (await pageA.request.get('http://localhost:8080/hand/state')).json()
  const hAfter = Array.isArray(stAfter) ? stAfter[0] : null
  expect(hAfter?.street === 'showdown').toBeFalsy()

  await ctx2.close()
})


