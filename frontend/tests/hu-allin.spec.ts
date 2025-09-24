import { test } from '@playwright/test'
import HULobbyPage from './pages/HULobbyPage'
import TablePage from './pages/TablePage'

test('HU all-in: shove + call -> auto runout to showdown', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  const lobbyA = new HULobbyPage(pageA)
  const lobbyB = new HULobbyPage(pageB)
  await lobbyA.openHUView()
  await lobbyB.openHUView()
  await lobbyA.setWalletName('ai_A')
  await lobbyB.setWalletName('ai_B')
  await lobbyA.joinQueue().catch(()=>{})
  await lobbyB.joinQueue().catch(()=>{})
  await lobbyA.waitForMatchEventFor('ai_A')

  const tableA = new TablePage(pageA)
  const tableB = new TablePage(pageB)
  await tableA.openTableView()
  await tableB.openTableView()

  // Versuchen, auf beiden Seiten ein All-in zu initiieren (wer gerade Actor ist)
  await tableA.clickAllInPresetIfVisible().catch(() => {})
  await tableB.clickAllInPresetIfVisible().catch(() => {})

  // Wenn danach ein Call möglich ist, betätigen
  await tableA.clickCallIfVisible().catch(() => {})
  await tableB.clickCallIfVisible().catch(() => {})

  await tableA.waitForRiver(12000)
  await tableA.expectOverlay()

  await ctx2.close()
})


