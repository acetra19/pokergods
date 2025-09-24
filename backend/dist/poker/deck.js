import { createDeck, shuffleDeck, deal } from "./cards.js";
import { randomInt } from "node:crypto";
export class DeckService {
    constructor(rng = secureRandom) {
        this.rng = rng;
        this.deck = shuffleDeck(createDeck(), this.rng);
    }
    remaining() {
        return this.deck.length;
    }
    draw(count) {
        const { cards, deck } = deal(this.deck, count);
        this.deck = deck;
        return { cards, deck: this.deck };
    }
    burn() {
        this.draw(1);
    }
}
// Returns a uniform float in [0,1) using cryptographically secure RNG
function secureRandom() {
    // randomInt is exclusive of the max; use 2^32 for high resolution
    const n = randomInt(0x1_0000_0000);
    return n / 0x1_0000_0000;
}
//# sourceMappingURL=deck.js.map