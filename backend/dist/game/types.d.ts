import type { Card } from "../poker/types.js";
export declare enum Street {
    Preflop = "preflop",
    Flop = "flop",
    Turn = "turn",
    River = "river",
    Showdown = "showdown"
}
export interface PlayerState {
    playerId: string;
    seatIndex: number;
    chips: number;
    hole?: Card[];
    inHand: boolean;
    allIn: boolean;
    busted: boolean;
}
export interface TablePublicState {
    tableId: string;
    handNumber: number;
    dealerIndex: number;
    smallBlind: number;
    bigBlind: number;
    pot: number;
    community: Card[];
    street: Street | null;
    players: Array<Pick<PlayerState, "playerId" | "seatIndex" | "chips" | "inHand" | "allIn" | "busted"> & {
        hole?: Card[];
    }>;
    lastWinners?: {
        playerId: string;
        amount: number;
    }[] | undefined;
    showdownInfo?: {
        playerId: string;
        category: string;
    }[] | undefined;
    /** true, wenn die aktuelle Setzrunde abgeschlossen ist (kein Live-Bet, alle haben geactet) */
    bettingClosed?: boolean;
    /** true, wenn weitere Bets/Raises nicht mehr erlaubt sind, weil jemand all-in ist */
    allInLocked?: boolean;
}
export type ActionType = "fold" | "check" | "call" | "bet" | "raise";
export interface ActionState {
    tableId: string;
    actorSeatIndex: number;
    actorPlayerId: string;
    currentBet: number;
    minRaise: number;
    committed: Record<string, number>;
    legalActions: ActionType[];
    actorDeadlineMs: number;
    actorTimebankMs: number;
}
//# sourceMappingURL=types.d.ts.map