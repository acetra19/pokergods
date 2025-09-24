import type { DealtCards } from "./types";
export declare class DeckService {
    private deck;
    private rng;
    constructor(rng?: () => number);
    remaining(): number;
    draw(count: number): DealtCards;
    burn(): void;
}
//# sourceMappingURL=deck.d.ts.map