export function suitSymbol(s: string): string {
  return s === 'hearts' ? '♥' : s === 'diamonds' ? '♦' : s === 'clubs' ? '♣' : '♠'
}

export function rankLabel(r: number): string {
  if (r === 14) return 'A'
  if (r === 13) return 'K'
  if (r === 12) return 'Q'
  if (r === 11) return 'J'
  return String(r)
}

export function formatCardLabel(c: { suit: string; rank: number }): string {
  return rankLabel(c.rank) + suitSymbol(c.suit)
}


