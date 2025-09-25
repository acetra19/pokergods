import type { TableState } from "../tournament/types.js";

export interface HUStatus {
  queueSize: number;
  matchTableId?: string | undefined;
  online?: number;
}

export class HUManager {
  private queue: string[] = [];
  private walletToTable: Map<string, string> = new Map();
  private nextId = 1;
  private onlineSet: Set<string> = new Set();
  public maxOnline: number = Number(process.env.HU_MAX_ONLINE || 128);

  public join(wallet: string): HUStatus {
    this.onlineSet.add(wallet);
    if (this.walletToTable.has(wallet)) {
      return { queueSize: this.queue.length, matchTableId: this.walletToTable.get(wallet), online: this.onlineSet.size };
    }
    if (this.onlineSet.size > this.maxOnline) {
      return { queueSize: this.queue.length, matchTableId: undefined, online: this.onlineSet.size };
    }
    if (!this.queue.includes(wallet)) {
      this.queue.push(wallet);
    }
    return { queueSize: this.queue.length, online: this.onlineSet.size };
  }

  public leave(wallet: string): HUStatus {
    this.queue = this.queue.filter((w) => w !== wallet);
    const tableId = this.walletToTable.get(wallet);
    this.onlineSet.delete(wallet);
    return { queueSize: this.queue.length, matchTableId: tableId, online: this.onlineSet.size };
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
    return { queueSize: this.queue.length, matchTableId: tableId, online: this.onlineSet.size };
  }

  public unmap(wallet: string): void {
    this.walletToTable.delete(wallet);
    this.onlineSet.delete(wallet);
  }

  public unmapMany(wallets: string[]): void {
    wallets.forEach((w) => { this.walletToTable.delete(w); this.onlineSet.delete(w); });
  }
}


