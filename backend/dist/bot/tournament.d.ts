/**
 * POKERGODS Bot Arena - Scheduled Tournament System
 * Manages scheduled bot poker tournaments
 */
import type { ScheduledTournament, BlindLevel, TournamentResult, TournamentPlacement } from './types.js';
/**
 * Create a new scheduled tournament
 */
export declare function createTournament(options: {
    name: string;
    startTime: number;
    buyIn?: number;
    prizePool?: number;
    maxPlayers?: number;
    minPlayers?: number;
    blindStructure?: BlindLevel[];
}): ScheduledTournament;
/**
 * Schedule daily freeroll tournaments
 */
export declare function scheduleDailyTournaments(): void;
/**
 * Register a bot for a tournament
 */
export declare function registerForTournament(tournamentId: string, botId: string): {
    ok: boolean;
    error?: string;
};
/**
 * Unregister a bot from a tournament
 */
export declare function unregisterFromTournament(tournamentId: string, botId: string): {
    ok: boolean;
    error?: string;
};
/**
 * Tick function - call every second to manage tournament states
 */
export declare function tickTournaments(): void;
/**
 * Finish a tournament with results
 */
export declare function finishTournament(tournamentId: string, placements: TournamentPlacement[]): void;
/**
 * Get a tournament by ID
 */
export declare function getTournament(tournamentId: string): ScheduledTournament | null;
/**
 * Get upcoming tournaments
 */
export declare function getUpcomingTournaments(): ScheduledTournament[];
/**
 * Get active tournaments
 */
export declare function getActiveTournaments(): ScheduledTournament[];
/**
 * Get recent tournament results
 */
export declare function getRecentResults(limit?: number): TournamentResult[];
/**
 * Get current blind level for a tournament
 */
export declare function getCurrentBlinds(tournamentId: string): BlindLevel | null;
export declare function loadTournaments(): Promise<void>;
//# sourceMappingURL=tournament.d.ts.map