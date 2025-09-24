import { EventEmitter } from "events";
import { TournamentState } from "./types.js";
export class TournamentManager extends EventEmitter {
    constructor(config) {
        super();
        this.state = TournamentState.Registration;
        this.registered = new Set();
        this.currentLevelIndex = 0;
        this.tables = [];
        this.config = config;
    }
    getPublicView() {
        return {
            id: this.config.id,
            name: this.config.name,
            startTimeMs: this.config.startTimeMs,
            state: this.state,
            registeredCount: this.registered.size,
        };
    }
    tryRegister(wallet) {
        if (this.state !== TournamentState.Registration)
            return false;
        if (this.registered.size >= this.config.maxPlayers)
            return false;
        if (this.registered.has(wallet))
            return true;
        this.registered.add(wallet);
        this.emit("update", this.getPublicView());
        return true;
    }
    tick(nowMs) {
        if (this.state === TournamentState.Registration) {
            if (nowMs >= this.config.startTimeMs) {
                this.state = TournamentState.Running;
                this.currentLevelIndex = 0;
                this.seatPlayers();
                this.emit("started", this.getPublicView());
            }
            return;
        }
        if (this.state === TournamentState.Running) {
            const elapsed = Math.floor((nowMs - this.config.startTimeMs) / 1000);
            let accum = 0;
            for (let i = 0; i < this.config.blindLevels.length; i += 1) {
                accum += this.config.blindLevels[i].durationSec;
                if (elapsed < accum) {
                    if (this.currentLevelIndex !== i) {
                        this.currentLevelIndex = i;
                        this.emit("level", this.getCurrentLevel());
                    }
                    return;
                }
            }
            this.state = TournamentState.Finished;
            this.emit("finished", this.getPublicView());
        }
    }
    getCurrentLevel() {
        const lvl = this.config.blindLevels[this.currentLevelIndex];
        return { index: this.currentLevelIndex, ...lvl };
    }
    getSeating() {
        return this.tables;
    }
    seatPlayers() {
        const startChips = this.config.startChips ?? 5000;
        const ids = Array.from(this.registered);
        const perTable = this.config.tableSize;
        const tables = [];
        for (let i = 0; i < ids.length; i += perTable) {
            const chunk = ids.slice(i, i + perTable);
            const seats = chunk.map((playerId, idx) => ({ playerId, seatIndex: idx, chips: startChips }));
            tables.push({ tableId: `T${1 + Math.floor(i / perTable)}`, seats });
        }
        this.tables = tables;
    }
    reset(newStartTimeMs) {
        this.state = TournamentState.Registration;
        this.currentLevelIndex = 0;
        this.registered = new Set();
        this.tables = [];
        this.config = { ...this.config, startTimeMs: newStartTimeMs };
        this.emit("update", this.getPublicView());
    }
    forceStart(nowMs) {
        this.state = TournamentState.Running;
        this.currentLevelIndex = 0;
        this.config = { ...this.config, startTimeMs: nowMs };
        this.seatPlayers();
        this.emit("started", this.getPublicView());
    }
}
//# sourceMappingURL=manager.js.map