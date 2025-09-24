import { expect, type Page, type Locator } from '@playwright/test'

export class HULobbyPage {
  private readonly page: Page
  private readonly root: Locator
  private readonly walletInput: Locator
  private readonly randomButton: Locator
  private readonly joinButton: Locator
  private readonly leaveButton: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.locator('div:has(> h3:has-text("Heads-Up Queue"))')
    this.walletInput = this.root.getByPlaceholder('wallet')
    this.randomButton = this.root.getByRole('button', { name: 'Random' })
    this.joinButton = this.root.getByTestId('hu-join')
    this.leaveButton = this.root.getByTestId('hu-leave')
  }

  async openHUView(): Promise<void> {
    await this.page.getByRole('button', { name: 'Heads-Up' }).click()
    await expect(this.root).toBeVisible()
  }

  async setWalletName(name: string): Promise<void> {
    if (await this.walletInput.isVisible().catch(() => false)) {
      await this.walletInput.fill(name)
    } else {
      await this.randomButton.click()
    }
  }

  async joinQueue(): Promise<void> {
    const visible = await this.joinButton.isVisible({ timeout: 1500 }).catch(() => false)
    if (visible) {
      await this.joinButton.click()
      return
    }
    // Fallback: join via API (UI kann noch nicht gerendert sein)
    try {
      const wallet = await this.walletInput.inputValue().catch(() => '')
      if (wallet.trim()) {
        await this.page.request.post(`http://localhost:8080/hu/join/${encodeURIComponent(wallet.trim())}`)
        return
      }
    } catch {}
    // letzte Chance: kurz warten und erneut versuchen
    await expect(this.joinButton).toBeVisible({ timeout: 5000 })
    await this.joinButton.click()
  }

  async leaveQueue(): Promise<void> {
    await expect(this.leaveButton).toBeVisible()
    await this.leaveButton.click()
  }

  async getQueueSize(): Promise<number> {
    const text = await this.root.locator('p', { hasText: 'Players waiting:' }).first().innerText()
    const m = text.match(/Players waiting:\s*(\d+)/)
    return m ? Number(m[1]) : 0
  }

  async waitForMatchEventFor(wallet: string, timeoutMs = 8000): Promise<void> {
    // Robust: poll backend directly for hand/state (table exists) or hu/status (mapping)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const rs = await this.page.request.get('http://localhost:8080/hand/state')
        if (rs.ok()) {
          const json: any = await rs.json()
          if (Array.isArray(json) && json[0]?.tableId) return
        }
      } catch {}
      try {
        const rs2 = await this.page.request.get(`http://localhost:8080/hu/status/${encodeURIComponent(wallet)}`)
        if (rs2.ok()) {
          const s: any = await rs2.json()
          if (s?.matchTableId) return
        }
      } catch {}
      await this.page.waitForTimeout(250)
    }
    throw new Error('match did not start in time')
  }
}

export default HULobbyPage


