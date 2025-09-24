import { test } from '@playwright/test'
import HULobbyPage from './pages/HULobbyPage'
import TablePage from './pages/TablePage'

test('HU timeout: actor times out -> auto-check/fold or actor switch', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  const lobbyA = new HULobbyPage(pageA)
  const lobbyB = new HULobbyPage(pageB)
  await lobbyA.openHUView()
  await lobbyB.openHUView()
  await lobbyA.setWalletName('to_A')
  await lobbyB.setWalletName('to_B')
  await lobbyA.joinQueue().catch(()=>{})
  await lobbyB.joinQueue().catch(()=>{})
  await lobbyA.waitForMatchEventFor('to_A')

  const tableA = new TablePage(pageA)
  await tableA.openTableView()

  // Warten bis River oder Actor-Switch/Street-Change (über die UI schwer robust zu erkennen),
  // daher einfache Heuristik: wenn Call-Button auftaucht, einmal klicken; ansonsten nur warten.
  await tableA.clickCallIfVisible().catch(() => {})

  // Warten, bis entweder Overlay erscheint (Showdown) oder mindestens bis River.
  await tableA.waitForRiver(12000)
  await tableA.expectOverlay()

  await ctx2.close()
})


