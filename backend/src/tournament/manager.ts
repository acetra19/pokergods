import { EventEmitter } from "events";
import type { TournamentConfig, TournamentPublicView, TableState } from "./types.js";
import { TournamentState } from "./types.js";

export class TournamentManager extends EventEmitter {
  private config: TournamentConfig;
  private state: TournamentState = TournamentState.Registration;
  private registered: Set<string> = new Set();
  private currentLevelIndex = 0;
  private tables: TableState[] = [];

  constructor(config: TournamentConfig) {
    super();
    this.config = config;
  }

  public getPublicView(): TournamentPublicView {
    return {
      id: this.config.id,
      name: this.config.name,
      startTimeMs: this.config.startTimeMs,
      state: this.state,
      registeredCount: this.registered.size,
    };
  }

  public tryRegister(wallet: string): boolean {
    if (this.state !== TournamentState.Registration) return false;
    if (this.registered.size >= this.config.maxPlayers) return false;
    if (this.registered.has(wallet)) return true;
    this.registered.add(wallet);
    this.emit("update", this.getPublicView());
    return true;
  }

  public tick(nowMs: number): void {
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
        accum += this.config.blindLevels[i]!.durationSec;
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

  public getCurrentLevel() {
    const lvl = this.config.blindLevels[this.currentLevelIndex]!;
    return { index: this.currentLevelIndex, ...lvl };
  }

  public getSeating(): TableState[] {
    return this.tables;
  }

  private seatPlayers(): void {
    const startChips = this.config.startChips ?? 5000;
    const ids = Array.from(this.registered);
    const perTable = this.config.tableSize;
    const tables: TableState[] = [];
    for (let i = 0; i < ids.length; i += perTable) {
      const chunk = ids.slice(i, i + perTable);
      const seats = chunk.map((playerId, idx) => ({ playerId, seatIndex: idx, chips: startChips }));
      tables.push({ tableId: `T${1 + Math.floor(i / perTable)}`, seats });
    }
    this.tables = tables;
  }

  public reset(newStartTimeMs: number): void {
    this.state = TournamentState.Registration;
    this.currentLevelIndex = 0;
    this.registered = new Set();
    this.tables = [];
    this.config = { ...this.config, startTimeMs: newStartTimeMs };
    this.emit("update", this.getPublicView());
  }

  public forceStart(nowMs: number): void {
    this.state = TournamentState.Running;
    this.currentLevelIndex = 0;
    this.config = { ...this.config, startTimeMs: nowMs };
    this.seatPlayers();
    this.emit("started", this.getPublicView());
  }
}


