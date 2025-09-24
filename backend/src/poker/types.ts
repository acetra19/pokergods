export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11 // Jack
  | 12 // Queen
  | 13 // King
  | 14; // Ace (high)

export interface Card {
  suit: Suit;
  rank: Rank;
}

export enum HandCategory {
  HighCard = 1,
  OnePair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
}

export interface EvaluatedHand {
  category: HandCategory;
  // Tie-breaker ranks in descending importance. Always length 5.
  kickers: Rank[];
  // The best five cards constituting the evaluated hand
  bestFive: Card[];
}

export interface DealtCards {
  cards: Card[];
  deck: Card[];
}


