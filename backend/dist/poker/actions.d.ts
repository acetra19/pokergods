export type ActionType = "fold" | "check" | "call" | "bet" | "raise";
export interface PlayerAction {
    playerId: string;
    type: ActionType;
    amount?: number;
}
export interface BettingState {
    pot: number;
    currentBet: number;
    toAct: string[];
    committed: Record<string, number>;
}
export declare function applyAction(state: BettingState, action: PlayerAction): BettingState;
//# sourceMappingURL=actions.d.ts.map