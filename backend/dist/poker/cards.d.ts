import type { Card, Rank, Suit } from "./types";
export declare const SUITS: Suit[];
export declare const RANKS: Rank[];
export declare function createDeck(): Card[];
export declare function shuffleDeck(deck: Card[], rng?: () => number): Card[];
export declare function deal(deck: Card[], count: number): {
    cards: Card[];
    deck: Card[];
};
export declare function formatCard(card: Card): string;
//# sourceMappingURL=cards.d.ts.map