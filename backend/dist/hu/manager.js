export class HUManager {
    constructor() {
        this.queue = [];
        this.walletToTable = new Map();
        this.nextId = 1;
        this.onlineSet = new Set();
        this.maxOnline = Number(process.env.HU_MAX_ONLINE || 128);
    }
    join(wallet) {
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
    leave(wallet) {
        this.queue = this.queue.filter((w) => w !== wallet);
        const tableId = this.walletToTable.get(wallet);
        this.onlineSet.delete(wallet);
        return { queueSize: this.queue.length, matchTableId: tableId, online: this.onlineSet.size };
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
        return { queueSize: this.queue.length, matchTableId: tableId, online: this.onlineSet.size };
    }
    unmap(wallet) {
        this.walletToTable.delete(wallet);
        this.onlineSet.delete(wallet);
    }
    unmapMany(wallets) {
        wallets.forEach((w) => { this.walletToTable.delete(w); this.onlineSet.delete(w); });
    }
}
//# sourceMappingURL=manager.js.map