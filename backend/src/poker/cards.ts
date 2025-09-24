import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const copy = deck.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = copy[i]!; // non-null due to bounds
    copy[i] = copy[j]!; // assert non-null per noUncheckedIndexedAccess
    copy[j] = t;
  }
  return copy;
}

export function deal(deck: Card[], count: number): { cards: Card[]; deck: Card[] } {
  if (count < 0 || count > deck.length) {
    throw new Error("deal: invalid count");
  }
  return { cards: deck.slice(0, count), deck: deck.slice(count) };
}

export function formatCard(card: Card): string {
  const rankToStr: Record<number, string> = {
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };
  const suitToStr: Record<Suit, string> = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠",
  };
  const rankStr = rankToStr[card.rank] ?? String(card.rank);
  return `${rankStr}${suitToStr[card.suit]}`;
}


