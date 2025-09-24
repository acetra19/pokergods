import type { Card, Rank, EvaluatedHand } from "./types.js";
import { HandCategory } from "./types.js";

function byRankDesc(a: Rank, b: Rank): number {
  return b - a;
}

function clone<T>(arr: T[]): T[] {
  return arr.slice();
}

function sortCardsDesc(cards: Card[]): Card[] {
  return clone(cards).sort((a, b) => b.rank - a.rank);
}

export function evaluateBestFive(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) throw new Error("need >=5 cards");
  const ranksCount = new Map<Rank, number>();
  const suitsCount = new Map<string, Card[]>();
  const sorted = sortCardsDesc(cards);

  for (const c of sorted) {
    ranksCount.set(c.rank, (ranksCount.get(c.rank) ?? 0) + 1);
    const list = suitsCount.get(c.suit) ?? [];
    list.push(c);
    suitsCount.set(c.suit, list);
  }

  // Check flush
  let flushCards: Card[] | null = null;
  for (const [, list] of suitsCount) {
    if (list.length >= 5) {
      flushCards = sortCardsDesc(list).slice(0, 5);
      break;
    }
  }

  // Check straight (and straight flush if flushCards set)
  const uniqueRanks = Array.from(new Set(sorted.map((c) => c.rank))).sort(byRankDesc);
  // Add wheel straight (A-5) handling by treating Ace as 1 (rank 14 -> 1)
  const uniqueWithWheel = uniqueRanks.includes(14) ? uniqueRanks.concat([1 as unknown as Rank]) : uniqueRanks;
  function findStraight(ranks: Rank[]): Rank[] | null {
    let streak = 1;
    for (let i = 0; i < ranks.length - 1; i += 1) {
      if (ranks[i] === (ranks[i + 1] as number) + 1) {
        streak += 1;
        if (streak >= 5) {
          return [ranks[i - 3], ranks[i - 2], ranks[i - 1], ranks[i], ranks[i + 1]] as Rank[];
        }
      } else if (ranks[i] !== ranks[i + 1]) {
        streak = 1;
      }
    }
    return null;
  }
  const straight = findStraight(uniqueWithWheel);

  // Straight flush
  if (flushCards) {
    const flushRanks = Array.from(new Set(flushCards.map((c) => c.rank))).sort(byRankDesc);
    const sf = findStraight(flushRanks);
    if (sf) {
      const bestFive = flushCards
        .filter((c) => sf.includes(c.rank))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 5);
      return { category: HandCategory.StraightFlush, kickers: bestFive.map((c) => c.rank), bestFive };
    }
  }

  // Four of a kind
  for (const [rank, cnt] of ranksCount) {
    if (cnt === 4) {
      const quads = sorted.filter((c) => c.rank === rank).slice(0, 4);
      const kicker = sorted.find((c) => c.rank !== rank)!;
      return { category: HandCategory.FourOfAKind, kickers: [rank, rank, rank, rank, kicker.rank], bestFive: [...quads, kicker] };
    }
  }

  // Full house
  const triples = Array.from(ranksCount.entries()).filter(([, cnt]) => cnt >= 3).map(([r]) => r).sort(byRankDesc);
  const pairs = Array.from(ranksCount.entries()).filter(([, cnt]) => cnt >= 2).map(([r]) => r).sort(byRankDesc);
  if ((triples.length >= 1 && pairs.length >= 2) || triples.length >= 2) {
    const topTrips = triples[0];
    const remainingPairs = pairs.filter((r) => r !== topTrips);
    const pairRank: Rank | undefined = remainingPairs[0] ?? triples[1];
    if (pairRank !== undefined) {
      const bestFive = [
        ...sorted.filter((c) => c.rank === topTrips).slice(0, 3),
        ...sorted.filter((c) => c.rank === pairRank).slice(0, 2),
      ];
      return { category: HandCategory.FullHouse, kickers: [topTrips, topTrips, topTrips, pairRank, pairRank] as Rank[], bestFive };
    }
  }

  // Flush
  if (flushCards) {
    return { category: HandCategory.Flush, kickers: flushCards.map((c) => c.rank), bestFive: flushCards };
  }

  // Straight
  if (straight) {
    const bestFive = sorted.filter((c) => straight.includes(c.rank)).slice(0, 5);
    return { category: HandCategory.Straight, kickers: bestFive.map((c) => c.rank), bestFive };
  }

  // Three of a kind
  if (triples.length >= 1) {
    const t = triples[0];
    const trips = sorted.filter((c) => c.rank === t).slice(0, 3);
    const kickers = sorted.filter((c) => c.rank !== t).slice(0, 2);
    const bestFive = [...trips, ...kickers];
    return { category: HandCategory.ThreeOfAKind, kickers: bestFive.map((c) => c.rank), bestFive };
  }

  // Two pair
  if (pairs.length >= 2) {
    const [p1, p2] = pairs.slice(0, 2);
    const pair1 = sorted.filter((c) => c.rank === p1).slice(0, 2);
    const pair2 = sorted.filter((c) => c.rank === p2).slice(0, 2);
    const kicker = sorted.find((c) => c.rank !== p1 && c.rank !== p2)!;
    const bestFive = [...pair1, ...pair2, kicker];
    return { category: HandCategory.TwoPair, kickers: bestFive.map((c) => c.rank), bestFive };
  }

  // One pair
  if (pairs.length >= 1) {
    const p = pairs[0];
    const pair = sorted.filter((c) => c.rank === p).slice(0, 2);
    const kickers = sorted.filter((c) => c.rank !== p).slice(0, 3);
    const bestFive = [...pair, ...kickers];
    return { category: HandCategory.OnePair, kickers: bestFive.map((c) => c.rank), bestFive };
  }

  // High card
  const bestFive = sorted.slice(0, 5);
  return { category: HandCategory.HighCard, kickers: bestFive.map((c) => c.rank), bestFive };
}


