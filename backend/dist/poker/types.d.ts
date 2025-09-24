export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
    suit: Suit;
    rank: Rank;
}
export declare enum HandCategory {
    HighCard = 1,
    OnePair = 2,
    TwoPair = 3,
    ThreeOfAKind = 4,
    Straight = 5,
    Flush = 6,
    FullHouse = 7,
    FourOfAKind = 8,
    StraightFlush = 9
}
export interface EvaluatedHand {
    category: HandCategory;
    kickers: Rank[];
    bestFive: Card[];
}
export interface DealtCards {
    cards: Card[];
    deck: Card[];
}
//# sourceMappingURL=types.d.ts.map