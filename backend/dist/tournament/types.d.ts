export declare enum TournamentState {
    Registration = "registration",
    Running = "running",
    Finished = "finished"
}
export interface BlindLevel {
    durationSec: number;
    smallBlind: number;
    bigBlind: number;
}
export interface TournamentConfig {
    id: string;
    name: string;
    startTimeMs: number;
    maxPlayers: number;
    tableSize: number;
    blindLevels: BlindLevel[];
    startChips?: number;
}
export interface TournamentPublicView {
    id: string;
    name: string;
    startTimeMs: number;
    state: TournamentState;
    registeredCount: number;
}
export interface PlayerSeat {
    playerId: string;
    seatIndex: number;
    chips: number;
}
export interface TableState {
    tableId: string;
    seats: PlayerSeat[];
}
//# sourceMappingURL=types.d.ts.map