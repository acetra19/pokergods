import type { Card, DealtCards } from "./types";
import { createDeck, shuffleDeck, deal } from "./cards.js";
import { randomInt } from "node:crypto";

export class DeckService {
  private deck: Card[];
  private rng: () => number;

  constructor(rng: () => number = secureRandom) {
    this.rng = rng;
    this.deck = shuffleDeck(createDeck(), this.rng);
  }

  public remaining(): number {
    return this.deck.length;
  }

  public draw(count: number): DealtCards {
    const { cards, deck } = deal(this.deck, count);
    this.deck = deck;
    return { cards, deck: this.deck };
  }

  public burn(): void {
    this.draw(1);
  }
}

// Returns a uniform float in [0,1) using cryptographically secure RNG
function secureRandom(): number {
  // randomInt is exclusive of the max; use 2^32 for high resolution
  const n = randomInt(0x1_0000_0000);
  return n / 0x1_0000_0000;
}


