import type { Card } from "../poker/types.js";
import type { TableState } from "../tournament/types.js";
import type { TablePublicState, ActionState } from "./types.js";
export declare class GameEngine {
    private readonly tableId;
    private players;
    private deck;
    private community;
    private pot;
    private handNumber;
    private dealerIndex;
    private street;
    private sb;
    private bb;
    private lastWinners;
    private showdownInfo;
    private committed;
    private actorSeatIndex;
    private currentBet;
    private minRaise;
    private lastToActSeatIndex;
    private actorDeadlineMs;
    private actorTimebankMsByPlayer;
    private runoutNextAtMs;
    private readonly runoutStepMs;
    private liveBetThisStreet;
    private primaryDecisionMs;
    private initialTimebankMs;
    private deckRng;
    private rigNext;
    private dbg;
    constructor(table: TableState, blinds: {
        sb: number;
        bb: number;
    });
    /**
     * Adjust decision timing for this engine (admin/testing)
     */
    setTiming(primaryMs: number, bankMs: number): void;
    /**
     * DEV-ONLY: Rig next hand (holes/board). Applied once on nextHand/deal.
     */
    rig(deal: {
        holeBySeat?: Record<number, Card[]>;
        community?: Card[];
    }): void;
    /**
     * Set RNG for next deck shuffle (provably-fair). Applied on nextHand.
     */
    setDeckRng(rng: () => number): void;
    nextHand(blinds: {
        sb: number;
        bb: number;
    }): void;
    private dealHoleCards;
    private postBlinds;
    advanceStreet(): void;
    private resetBettingForNewStreet;
    private resolveShowdown;
    private areAllLiveAllIn;
    private runOutToShowdown;
    getPublic(): TablePublicState;
    getActionState(): ActionState | null;
    applyAction(playerId: string, type: "fold" | "check" | "call" | "bet" | "raise", amount?: number): void;
    tickTimeout(now: number): boolean;
}
//# sourceMappingURL=engine.d.ts.map