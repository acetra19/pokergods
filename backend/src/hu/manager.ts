import type { TableState } from "../tournament/types.js";

export interface HUStatus {
  queueSize: number;
  matchTableId?: string | undefined;
}

export class HUManager {
  private queue: string[] = [];
  private walletToTable: Map<string, string> = new Map();
  private nextId = 1;

  public join(wallet: string): HUStatus {
    if (this.walletToTable.has(wallet)) {
      return { queueSize: this.queue.length, matchTableId: this.walletToTable.get(wallet) };
    }
    if (!this.queue.includes(wallet)) {
      this.queue.push(wallet);
    }
    return { queueSize: this.queue.length };
  }

  public leave(wallet: string): HUStatus {
    this.queue = this.queue.filter((w) => w !== wallet);
    const tableId = this.walletToTable.get(wallet);
    return { queueSize: this.queue.length, matchTableId: tableId };
  }

  public popMatch(): { table: TableState } | null {
    if (this.queue.length < 2) return null;
    const a = this.queue.shift()!;
    const b = this.queue.shift()!;
    const tableId = `HU-${this.nextId++}`;
    const startChips = 3000;
    const table: TableState = {
      tableId,
      seats: [
        { playerId: a, seatIndex: 0, chips: startChips },
        { playerId: b, seatIndex: 1, chips: startChips },
      ],
    };
    this.walletToTable.set(a, tableId);
    this.walletToTable.set(b, tableId);
    return { table };
  }

  // --- Bot helpers ---
  public createBotMatch(humanWallet: string, botId: string = "BOT"): { table: TableState } {
    const tableId = `HU-BOT-${this.nextId++}`;
    const startChips = 3000;
    const seats = Math.random() < 0.5
      ? [
          { playerId: humanWallet, seatIndex: 0, chips: startChips },
          { playerId: botId, seatIndex: 1, chips: startChips },
        ]
      : [
          { playerId: botId, seatIndex: 0, chips: startChips },
          { playerId: humanWallet, seatIndex: 1, chips: startChips },
        ];
    const table: TableState = { tableId, seats };
    this.walletToTable.set(humanWallet, tableId);
    this.walletToTable.set(botId, tableId);
    return { table };
  }

  public status(wallet: string | undefined): HUStatus {
    const tableId = wallet ? this.walletToTable.get(wallet) : undefined;
    return { queueSize: this.queue.length, matchTableId: tableId };
  }

  public unmap(wallet: string): void {
    this.walletToTable.delete(wallet);
  }

  public unmapMany(wallets: string[]): void {
    wallets.forEach((w) => this.walletToTable.delete(w));
  }
}


