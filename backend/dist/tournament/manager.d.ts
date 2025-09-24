import { EventEmitter } from "events";
import type { TournamentConfig, TournamentPublicView, TableState } from "./types.js";
export declare class TournamentManager extends EventEmitter {
    private config;
    private state;
    private registered;
    private currentLevelIndex;
    private tables;
    constructor(config: TournamentConfig);
    getPublicView(): TournamentPublicView;
    tryRegister(wallet: string): boolean;
    tick(nowMs: number): void;
    getCurrentLevel(): {
        durationSec: number;
        smallBlind: number;
        bigBlind: number;
        index: number;
    };
    getSeating(): TableState[];
    private seatPlayers;
    reset(newStartTimeMs: number): void;
    forceStart(nowMs: number): void;
}
//# sourceMappingURL=manager.d.ts.map