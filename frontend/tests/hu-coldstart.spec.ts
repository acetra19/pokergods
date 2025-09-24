import { test, expect } from '@playwright/test'
import HULobbyPage from './pages/HULobbyPage'
import TablePage from './pages/TablePage'

test('HU cold start: two browsers join, all-in+call, river->overlay', async ({ browser, context }) => {
  const ctx2 = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await ctx2.newPage()

  await pageA.goto('/')
  await pageB.goto('/')

  const lobbyA = new HULobbyPage(pageA)
  const lobbyB = new HULobbyPage(pageB)
  await lobbyA.openHUView()
  await lobbyB.openHUView()
  await lobbyA.setWalletName('ps_A')
  await lobbyB.setWalletName('ps_B')
  await lobbyA.joinQueue().catch(()=>{})
  await lobbyB.joinQueue().catch(()=>{})
  await lobbyA.waitForMatchEventFor('ps_A')

  const tableA = new TablePage(pageA)
  const tableB = new TablePage(pageB)
  await tableA.openTableView()
  await tableB.openTableView()

  await tableA.clickAllInPresetIfVisible().catch(() => {})
  await tableB.clickAllInPresetIfVisible().catch(() => {})

  // Toggle chat if present (non-fatal)
  await pageA.getByRole('button', { name: /Show log|Hide log/ }).click({ trial: true }).catch(() => {})

  await tableA.waitForRiver(12000)
  await tableA.expectOverlay()

  await ctx2.close()
})


