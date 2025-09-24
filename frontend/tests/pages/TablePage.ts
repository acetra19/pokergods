import { expect, type Page, type Locator } from '@playwright/test'

export class TablePage {
  private readonly page: Page
  private readonly root: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.locator('h2', { hasText: 'Table' })
  }

  async openTableView(): Promise<void> {
    await this.page.getByRole('button', { name: 'Table' }).click().catch(() => {})
    // Warten bis Tisch-Felt existiert (robuster als Street-Text)
    await this.page.waitForSelector('.felt', { timeout: 10000 })
  }

  async clickAllInPresetIfVisible(): Promise<boolean> {
    const allIn = this.page.getByTestId('allin-preset')
    if (await allIn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await allIn.click()
      const submitBet = this.page.getByTestId('submit-bet')
      const submitRaise = this.page.getByTestId('submit-raise')
      if (await submitBet.isVisible({ timeout: 500 }).catch(() => false)) {
        await submitBet.click()
        return true
      }
      if (await submitRaise.isVisible({ timeout: 500 }).catch(() => false)) {
        await submitRaise.click()
        return true
      }
    }
    return false
  }

  async waitForRiver(timeoutMs = 8000): Promise<void> {
    await this.page.waitForFunction(() => {
      const comm = document.querySelectorAll('.community .card-md')
      return comm.length >= 5
    }, null, { timeout: timeoutMs })
  }

  async expectOverlay(timeoutMs = 12000): Promise<void> {
    await expect(this.page.getByText(/You Win|You Lose/)).toBeVisible({ timeout: timeoutMs })
  }

  async getToActText(): Promise<string> {
    const bar = this.page.locator('.action-bar').first()
    await expect(bar).toBeVisible({ timeout: 8000 })
    return (await bar.innerText()) || ''
  }

  async clickCallIfVisible(): Promise<boolean> {
    const callBtn = this.page.getByRole('button', { name: /^(Call|Call\s+\d+)/ })
    if (await callBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await callBtn.click()
      return true
    }
    return false
  }
}

export default TablePage


