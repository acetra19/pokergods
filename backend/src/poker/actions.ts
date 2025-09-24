export type ActionType = "fold" | "check" | "call" | "bet" | "raise";

export interface PlayerAction {
  playerId: string;
  type: ActionType;
  amount?: number; // for bet/raise
}

export interface BettingState {
  pot: number;
  currentBet: number;
  toAct: string[]; // queue of playerIds
  committed: Record<string, number>;
}

export function applyAction(state: BettingState, action: PlayerAction): BettingState {
  const next: BettingState = {
    pot: state.pot,
    currentBet: state.currentBet,
    toAct: state.toAct.filter((id) => id !== action.playerId),
    committed: { ...state.committed },
  };

  if (action.type === "fold") {
    return next;
  }

  if (action.type === "check") {
    if ((state.committed[action.playerId] ?? 0) < state.currentBet) {
      throw new Error("cannot check facing a bet");
    }
    return next;
  }

  if (action.type === "call") {
    const need = state.currentBet - (state.committed[action.playerId] ?? 0);
    if (need <= 0) return next;
    next.committed[action.playerId] = (next.committed[action.playerId] ?? 0) + need;
    next.pot += need;
    return next;
  }

  if (action.type === "bet" || action.type === "raise") {
    const amount = action.amount ?? 0;
    if (amount <= state.currentBet) throw new Error("bet/raise must exceed current bet");
    const need = amount - (state.committed[action.playerId] ?? 0);
    if (need <= 0) throw new Error("invalid bet/raise amount");
    next.currentBet = amount;
    next.committed[action.playerId] = (next.committed[action.playerId] ?? 0) + need;
    next.pot += need;
    // players behind need to act again
    return next;
  }

  return next;
}


