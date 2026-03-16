import type { Card, Suit, Rank } from "./types.js";
import { evaluateBestFive } from "./handEvaluator.js";
import { SUITS, RANKS } from "./cards.js";

function compareHands(a: ReturnType<typeof evaluateBestFive>, b: ReturnType<typeof evaluateBestFive>): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < a.kickers.length; i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function cardKey(c: Card): string {
  return `${c.rank}:${c.suit}`;
}

function remainingDeck(used: Card[]): Card[] {
  const usedSet = new Set(used.map(cardKey));
  return fullDeck().filter(c => !usedSet.has(cardKey(c)));
}

/**
 * Exact equity for 2 players given known hole cards + community.
 * After flop: 990 combos, after turn: 44 combos — trivially fast.
 * Pre-flop: uses Monte Carlo with sampleLimit iterations.
 */
export function headsUpEquity(
  holeA: Card[],
  holeB: Card[],
  community: Card[],
  sampleLimit = 5000
): { equityA: number; equityB: number } {
  const remaining = remainingDeck([...holeA, ...holeB, ...community]);
  const needed = 5 - community.length;

  if (needed === 0) {
    const evalA = evaluateBestFive([...holeA, ...community]);
    const evalB = evaluateBestFive([...holeB, ...community]);
    const cmp = compareHands(evalA, evalB);
    if (cmp > 0) return { equityA: 100, equityB: 0 };
    if (cmp < 0) return { equityA: 0, equityB: 100 };
    return { equityA: 50, equityB: 50 };
  }

  const useExact = needed <= 2;
  let winsA = 0, winsB = 0, ties = 0, total = 0;

  if (useExact) {
    if (needed === 1) {
      for (const c of remaining) {
        const board = [...community, c];
        const evalA = evaluateBestFive([...holeA, ...board]);
        const evalB = evaluateBestFive([...holeB, ...board]);
        const cmp = compareHands(evalA, evalB);
        if (cmp > 0) winsA++;
        else if (cmp < 0) winsB++;
        else ties++;
        total++;
      }
    } else {
      for (let i = 0; i < remaining.length - 1; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          const board = [...community, remaining[i], remaining[j]];
          const evalA = evaluateBestFive([...holeA, ...board]);
          const evalB = evaluateBestFive([...holeB, ...board]);
          const cmp = compareHands(evalA, evalB);
          if (cmp > 0) winsA++;
          else if (cmp < 0) winsB++;
          else ties++;
          total++;
        }
      }
    }
  } else {
    for (let s = 0; s < sampleLimit; s++) {
      const drawn: Card[] = [];
      const pool = remaining.slice();
      for (let d = 0; d < needed; d++) {
        const idx = Math.floor(Math.random() * pool.length);
        drawn.push(pool[idx]);
        pool[idx] = pool[pool.length - 1];
        pool.pop();
      }
      const board = [...community, ...drawn];
      const evalA = evaluateBestFive([...holeA, ...board]);
      const evalB = evaluateBestFive([...holeB, ...board]);
      const cmp = compareHands(evalA, evalB);
      if (cmp > 0) winsA++;
      else if (cmp < 0) winsB++;
      else ties++;
      total++;
    }
  }

  const halfTies = ties / 2;
  const eqA = ((winsA + halfTies) / total) * 100;
  const eqB = ((winsB + halfTies) / total) * 100;
  return { equityA: Math.round(eqA * 10) / 10, equityB: Math.round(eqB * 10) / 10 };
}
