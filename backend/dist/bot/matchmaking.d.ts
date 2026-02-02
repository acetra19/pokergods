/**
 * POKERGODS Bot Arena - Matchmaking
 * Simple Heads-Up SNG Matchmaking System
 */
import type { Card } from './types.js';
export interface Match {
    matchId: string;
    bot1Id: string;
    bot2Id: string;
    startTime: number;
    status: 'waiting' | 'playing' | 'finished';
    winnerId?: string;
    loserId?: string;
    handsPlayed: number;
    chips: Record<string, number>;
    dealer: number;
    currentHand?: HandState;
}
export type HandStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export interface HandState {
    handNumber: number;
    street: HandStreet;
    pot: number;
    community: Card[];
    hole: Record<string, Card[]>;
    chips: Record<string, number>;
    committed: Record<string, number>;
    toAct: string;
    lastAction?: {
        botId: string;
        action: string;
        amount?: number;
    };
    lastAggressor?: string;
    actedThisRound: Set<string>;
    smallBlind: number;
    bigBlind: number;
    deck: Card[];
    isAllIn: boolean;
}
export declare function joinQueue(botId: string): {
    ok: boolean;
    error?: string;
    position?: number;
};
export declare function leaveQueue(botId: string): {
    ok: boolean;
};
export declare function getQueueStatus(): {
    queueSize: number;
    activeMatches: number;
};
export declare function getQueuePosition(botId: string): number;
export declare function handleBotAction(botId: string, action: string, amount?: number): {
    ok: boolean;
    error?: string;
};
export declare function getMatch(matchId: string): Match | undefined;
export declare function getBotMatch(botId: string): Match | undefined;
export declare function getActiveMatches(): Match[];
export declare function isInMatch(botId: string): boolean;
//# sourceMappingURL=matchmaking.d.ts.map