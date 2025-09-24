export class HUManager {
    constructor() {
        this.queue = [];
        this.walletToTable = new Map();
        this.nextId = 1;
    }
    join(wallet) {
        if (this.walletToTable.has(wallet)) {
            return { queueSize: this.queue.length, matchTableId: this.walletToTable.get(wallet) };
        }
        if (!this.queue.includes(wallet)) {
            this.queue.push(wallet);
        }
        return { queueSize: this.queue.length };
    }
    leave(wallet) {
        this.queue = this.queue.filter((w) => w !== wallet);
        const tableId = this.walletToTable.get(wallet);
        return { queueSize: this.queue.length, matchTableId: tableId };
    }
    popMatch() {
        if (this.queue.length < 2)
            return null;
        const a = this.queue.shift();
        const b = this.queue.shift();
        const tableId = `HU-${this.nextId++}`;
        const startChips = 3000;
        const table = {
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
    createBotMatch(humanWallet, botId = "BOT") {
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
        const table = { tableId, seats };
        this.walletToTable.set(humanWallet, tableId);
        this.walletToTable.set(botId, tableId);
        return { table };
    }
    status(wallet) {
        const tableId = wallet ? this.walletToTable.get(wallet) : undefined;
        return { queueSize: this.queue.length, matchTableId: tableId };
    }
    unmap(wallet) {
        this.walletToTable.delete(wallet);
    }
    unmapMany(wallets) {
        wallets.forEach((w) => this.walletToTable.delete(w));
    }
}
//# sourceMappingURL=manager.js.map