/**
 * POKERGODS Bot Arena - Cash Games System
 * Stakes-based tables with join/leave functionality
 */
export interface CashTable {
    tableId: string;
    name: string;
    stakes: StakeLevel;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number;
    maxBuyIn: number;
    maxPlayers: number;
    players: TablePlayer[];
    status: 'waiting' | 'playing' | 'paused';
    handNumber: number;
    pot: number;
    community: any[];
    dealerSeat: number;
    currentTurn: number;
    createdAt: number;
}
export interface TablePlayer {
    botId: string;
    botName: string;
    seat: number;
    chips: number;
    status: 'active' | 'sitting_out' | 'all_in' | 'folded';
    betThisRound: number;
    holeCards?: any[];
}
export type StakeLevel = 'micro' | 'low' | 'mid' | 'high' | 'nosebleed';
export declare const STAKES: Record<StakeLevel, {
    sb: number;
    bb: number;
    name: string;
}>;
export interface ArenaStats {
    botsOnline: number;
    activeTables: number;
    totalHands: number;
    totalChips: number;
    lastUpdated: number;
}
/**
 * Create a new cash game table
 */
export declare function createCashTable(options: {
    name: string;
    stakes: StakeLevel;
    maxPlayers?: number;
}): CashTable;
/**
 * Get a table by ID
 */
export declare function getCashTable(tableId: string): CashTable | null;
/**
 * List all tables, optionally filtered by stakes
 */
export declare function listCashTables(options?: {
    stakes?: StakeLevel;
    hasSeats?: boolean;
}): CashTable[];
/**
 * Join a table
 */
export declare function joinCashTable(tableId: string, botId: string, buyIn: number): {
    ok: boolean;
    error?: string;
    seat?: number;
};
/**
 * Leave a table
 */
export declare function leaveCashTable(tableId: string, botId: string): {
    ok: boolean;
    error?: string;
    cashOut?: number;
};
/**
 * Get spectator view of a table (no hole cards)
 */
export declare function getTableSpectatorView(tableId: string): any;
/**
 * Claim daily chips
 */
export declare function claimDailyChips(botId: string): {
    ok: boolean;
    error?: string;
    chips?: number;
    nextClaimAt?: number;
};
/**
 * Check daily claim status
 */
export declare function getDailyClaimStatus(botId: string): {
    canClaim: boolean;
    lastClaimAt: number | null;
    nextClaimAt: number | null;
    amount: number;
};
/**
 * Get arena stats
 */
export declare function getArenaStats(): ArenaStats;
/**
 * Increment hands played
 */
export declare function incrementHandsPlayed(): void;
/**
 * Ensure default tables exist for each stake level
 */
export declare function ensureDefaultTables(): void;
export declare function loadCashGames(): Promise<void>;
//# sourceMappingURL=cashgames.d.ts.map