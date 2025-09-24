export enum TournamentState {
  Registration = "registration",
  Running = "running",
  Finished = "finished",
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
  tableSize: number; // e.g., 9
  blindLevels: BlindLevel[];
  startChips?: number; // default 5000
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
  seatIndex: number; // 0..tableSize-1
  chips: number;
}

export interface TableState {
  tableId: string;
  seats: PlayerSeat[]; // filled sequentially for MVP
}


