export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'
export type Rank = 2|3|4|5|6|7|8|9|10|11|12|13|14
export type Card = { suit: Suit, rank: Rank }

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
  category: HandCategory
  kickers: Rank[]
  bestFive: Card[]
}

function byRankDesc(a: Rank, b: Rank): number { return (b as number) - (a as number) }
function sortCardsDesc(cards: Card[]): Card[] { return cards.slice().sort((a, b) => (b.rank as number) - (a.rank as number)) }

export function evaluateBestFive(cards: Card[]): EvaluatedHand {
  if (cards.length < 2) throw new Error('need >=2 cards')
  // pad with virtual blanks if <5? We just evaluate over available; straights/flushes need 5 distinct cards; pick best possible within available.
  const sorted = sortCardsDesc(cards)
  const ranksCount = new Map<Rank, number>()
  const suitsMap = new Map<Suit, Card[]>()
  for (const c of sorted) {
    ranksCount.set(c.rank, (ranksCount.get(c.rank) ?? 0) + 1)
    const list = suitsMap.get(c.suit) ?? []
    list.push(c)
    suitsMap.set(c.suit, list)
  }

  // Flush
  let flushCards: Card[] | null = null
  for (const [, list] of suitsMap) {
    if (list.length >= 5) { flushCards = sortCardsDesc(list).slice(0, 5); break }
  }

  // Straight helper (with wheel handling)
  const uniqueRanks = Array.from(new Set(sorted.map(c => c.rank))).sort(byRankDesc)
  const uniqueWithWheel = uniqueRanks.includes(14 as Rank) ? (uniqueRanks as number[]).concat(1) as Rank[] : uniqueRanks
  function findStraight(ranks: Rank[]): Rank[] | null {
    let streak = 1
    for (let i = 0; i < ranks.length - 1; i += 1) {
      if ((ranks[i] as number) === (ranks[i + 1] as number) + 1) {
        streak += 1
        if (streak >= 5) {
          return [ranks[i - 3]!, ranks[i - 2]!, ranks[i - 1]!, ranks[i]!, ranks[i + 1]!] as Rank[]
        }
      } else if (ranks[i] !== ranks[i + 1]) {
        streak = 1
      }
    }
    return null
  }
  const straight = findStraight(uniqueWithWheel)

  // Straight flush
  if (flushCards) {
    const flushRanks = Array.from(new Set(flushCards.map(c => c.rank))).sort(byRankDesc)
    const sf = findStraight(flushRanks)
    if (sf) {
      const bestFive = flushCards.filter(c => sf.includes(c.rank)).sort((a, b) => (b.rank as number) - (a.rank as number)).slice(0, 5)
      return { category: HandCategory.StraightFlush, kickers: bestFive.map(c => c.rank), bestFive }
    }
  }

  // Quads
  for (const [rank, cnt] of ranksCount) {
    if (cnt === 4) {
      const quads = sorted.filter(c => c.rank === rank).slice(0, 4)
      const kicker = sorted.find(c => c.rank !== rank)!
      return { category: HandCategory.FourOfAKind, kickers: [rank, rank, rank, rank, kicker.rank], bestFive: [...quads, kicker] }
    }
  }

  // Full house
  const triples = Array.from(ranksCount.entries()).filter(([, cnt]) => cnt >= 3).map(([r]) => r).sort(byRankDesc)
  const pairs = Array.from(ranksCount.entries()).filter(([, cnt]) => cnt >= 2).map(([r]) => r).sort(byRankDesc)
  if ((triples.length >= 1 && pairs.length >= 2) || triples.length >= 2) {
    const topTrips = triples[0]!
    const remainingPairs = pairs.filter(r => r !== topTrips)
    const pairRank = remainingPairs[0] ?? triples[1]
    if (pairRank !== undefined) {
      const bestFive = [
        ...sorted.filter(c => c.rank === topTrips).slice(0, 3),
        ...sorted.filter(c => c.rank === pairRank).slice(0, 2),
      ]
      return { category: HandCategory.FullHouse, kickers: [topTrips, topTrips, topTrips, pairRank as Rank, pairRank as Rank], bestFive }
    }
  }

  // Flush
  if (flushCards) {
    return { category: HandCategory.Flush, kickers: flushCards.map(c => c.rank), bestFive: flushCards }
  }

  // Straight
  if (straight) {
    const bestFive = sorted.filter(c => straight.includes(c.rank)).slice(0, 5)
    return { category: HandCategory.Straight, kickers: bestFive.map(c => c.rank), bestFive }
  }

  // Trips
  if (triples.length >= 1) {
    const t = triples[0]!
    const trips = sorted.filter(c => c.rank === t).slice(0, 3)
    const kickers = sorted.filter(c => c.rank !== t).slice(0, 2)
    const bestFive = [...trips, ...kickers]
    return { category: HandCategory.ThreeOfAKind, kickers: bestFive.map(c => c.rank), bestFive }
  }

  // Two pair
  if (pairs.length >= 2) {
    const [p1, p2] = pairs.slice(0, 2)
    const pair1 = sorted.filter(c => c.rank === p1).slice(0, 2)
    const pair2 = sorted.filter(c => c.rank === p2).slice(0, 2)
    const kicker = sorted.find(c => c.rank !== p1 && c.rank !== p2)!
    const bestFive = [...pair1, ...pair2, kicker]
    return { category: HandCategory.TwoPair, kickers: bestFive.map(c => c.rank), bestFive }
  }

  // One pair
  if (pairs.length >= 1) {
    const p = pairs[0]!
    const pair = sorted.filter(c => c.rank === p).slice(0, 2)
    const kickers = sorted.filter(c => c.rank !== p).slice(0, 3)
    const bestFive = [...pair, ...kickers]
    return { category: HandCategory.OnePair, kickers: bestFive.map(c => c.rank), bestFive }
  }

  // High card
  const bestFive = sorted.slice(0, 5)
  return { category: HandCategory.HighCard, kickers: bestFive.map(c => c.rank), bestFive }
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return (a.category as number) - (b.category as number)
  for (let i = 0; i < 5; i += 1) {
    const da = (a.kickers[i] as number) || 0
    const db = (b.kickers[i] as number) || 0
    if (da !== db) return da - db
  }
  return 0
}


