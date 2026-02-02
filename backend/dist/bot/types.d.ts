/**
 * POKERGODS Bot Arena - Type Definitions
 * Types for autonomous poker bots/agents
 */
export interface BotRegistration {
    botId: string;
    name: string;
    ownerId: string;
    apiKey: string;
    createdAt: number;
    lastActiveAt: number;
    stats: BotStats;
    status: BotStatus;
}
export interface BotStats {
    matchesPlayed: number;
    matchesWon: number;
    handsPlayed: number;
    totalWinnings: number;
    elo: number;
    bestFinish: number;
}
export type BotStatus = 'active' | 'inactive' | 'banned' | 'pending';
export interface BotSession {
    sessionId: string;
    botId: string;
    connectedAt: number;
    lastPingAt: number;
    currentTableId: string | null;
    currentTournamentId: string | null;
}
export interface BotGameState {
    type: 'game_state';
    tableId: string;
    handNumber: number;
    street: Street;
    pot: number;
    community: Card[];
    yourSeat: number;
    yourHole: Card[];
    yourChips: number;
    yourCommitted: number;
    opponent: {
        seatIndex: number;
        chips: number;
        committed: number;
        isAllIn: boolean;
    };
    smallBlind: number;
    bigBlind: number;
    dealerSeat: number;
    isYourTurn: boolean;
    actionRequired?: BotActionRequired;
}
export interface BotActionRequired {
    deadline: number;
    legalActions: LegalAction[];
    currentBet: number;
    minRaise: number;
    maxRaise: number;
    toCall: number;
}
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | null;
export interface Card {
    suit: 'clubs' | 'diamonds' | 'hearts' | 'spades';
    rank: number;
}
export type LegalAction = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export interface BotAction {
    type: 'action';
    action: LegalAction;
    amount?: number;
}
export type ServerToBotMessage = {
    type: 'connected';
    botId: string;
    sessionId: string;
} | {
    type: 'game_state';
    state: BotGameState;
} | {
    type: 'action_required';
    state: BotGameState;
} | {
    type: 'hand_result';
    result: HandResult;
} | {
    type: 'match_start';
    tableId: string;
    opponent: string;
} | {
    type: 'match_end';
    result: MatchResult;
} | {
    type: 'tournament_start';
    tournamentId: string;
    name: string;
} | {
    type: 'tournament_end';
    tournamentId: string;
    placement: number;
    prize: number;
} | {
    type: 'error';
    code: string;
    message: string;
} | {
    type: 'ping';
};
export type BotToServerMessage = {
    type: 'action';
    action: LegalAction;
    amount?: number;
} | {
    type: 'pong';
};
export interface HandResult {
    tableId: string;
    handNumber: number;
    winners: {
        botId: string;
        amount: number;
    }[];
    showdown?: ShowdownInfo[];
    yourChipsAfter: number;
}
export interface ShowdownInfo {
    botId: string;
    hole: Card[];
    category: string;
}
export interface MatchResult {
    tableId: string;
    winnerId: string;
    loserId: string;
    handsPlayed: number;
    finalChips: {
        [botId: string]: number;
    };
    eloChange: {
        [botId: string]: number;
    };
}
export interface ScheduledTournament {
    tournamentId: string;
    name: string;
    startTime: number;
    registrationDeadline: number;
    buyIn: number;
    prizePool: number;
    maxPlayers: number;
    minPlayers: number;
    status: TournamentStatus;
    registeredBots: string[];
    blindStructure: BlindLevel[];
    currentLevel: number;
}
export type TournamentStatus = 'scheduled' | 'registration_open' | 'starting' | 'running' | 'final_table' | 'finished' | 'cancelled';
export interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    durationMinutes: number;
}
export interface TournamentResult {
    tournamentId: string;
    placements: TournamentPlacement[];
    totalHands: number;
    duration: number;
}
export interface TournamentPlacement {
    place: number;
    botId: string;
    botName: string;
    prize: number;
    handsPlayed: number;
}
export interface ApiKeyRecord {
    keyHash: string;
    botId: string;
    ownerId: string;
    createdAt: number;
    lastUsedAt: number;
    permissions: ApiKeyPermission[];
}
export type ApiKeyPermission = 'play' | 'register' | 'admin';
export interface SpectatorGameState {
    tableId: string;
    tournamentId?: string;
    handNumber: number;
    street: Street;
    pot: number;
    community: Card[];
    players: SpectatorPlayer[];
    dealerSeat: number;
    actorSeat: number | null;
    actionDeadline: number | null;
    lastAction?: {
        botId: string;
        action: string;
        amount?: number;
    };
}
export interface SpectatorPlayer {
    seatIndex: number;
    botId: string;
    botName: string;
    chips: number;
    committed: number;
    isAllIn: boolean;
    isFolded: boolean;
    hole: Card[] | null;
}
//# sourceMappingURL=types.d.ts.map