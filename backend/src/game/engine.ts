import { DeckService } from "../poker/deck.js";
import type { Card } from "../poker/types.js";
import { evaluateBestFive } from "../poker/handEvaluator.js";
import type { TableState } from "../tournament/types.js";
import type { PlayerState, TablePublicState, ActionState } from "./types.js";
import { Street } from "./types.js";

export class GameEngine {
  private readonly tableId: string;
  private players: PlayerState[] = [];
  private deck: DeckService = new DeckService();
  private community: Card[] = [];
  private pot = 0;
  private handNumber = 0;
  private dealerIndex = 0;
  private street: Street | null = null;
  private sb = 0;
  private bb = 0;
  private lastWinners: { playerId: string; amount: number }[] | undefined;
  private showdownInfo: { playerId: string; category: string }[] | undefined;
  // betting state
  private committed: Record<string, number> = {};
  private actorSeatIndex = 0;
  private currentBet = 0;
  private minRaise = 0;
  private lastToActSeatIndex = 0;
  private actorDeadlineMs = 0;
  private actorTimebankMsByPlayer: Record<string, number> = {}; // per-player timebank
  private runoutNextAtMs: number = 0; // schedule staged runout timings
  private readonly runoutStepMs: number = 800;
  private liveBetThisStreet: boolean = false; // track whether a live bet/raise occurred
  // timing configuration (overridable via env)
  private primaryDecisionMs: number = Number(process.env.GE_PRIMARY_MS ?? 20_000);
  private initialTimebankMs: number = Number(process.env.GE_BANK_MS ?? 30_000);
  // provably-fair: optional RNG for next shuffle
  private deckRng: (() => number) | undefined;
  // dev-only rigging for next hand (hole cards and/or community order)
  private rigNext: { holeBySeat?: Record<number, Card[]>; community?: Card[] } | null = null;
  private dbg(msg: string, extra?: unknown) {
    try {
      const resolveName = (pid: any): string => {
        try { const fn = (globalThis as any).__pgResolveName; return typeof fn === 'function' ? String(fn(String(pid))) : String(pid); } catch { return String(pid) }
      };
      const transform = (val: any): any => {
        if (!val || typeof val !== 'object') return val;
        if (Array.isArray(val)) return val.map(transform);
        const out: any = { ...val };
        if (typeof out.playerId === 'string') out.displayName = resolveName(out.playerId);
        // map nested common shapes
        Object.keys(out).forEach((k) => {
          const v = out[k];
          if (v && typeof v === 'object') out[k] = transform(v);
        });
        return out;
      };
      const mapped = transform(extra);
      console.debug(`[GE ${this.tableId} h${this.handNumber} ${this.street ?? 'init'}] ${msg}`, mapped ?? '');
    } catch {}
  }

  constructor(table: TableState, blinds: { sb: number; bb: number }) {
    this.tableId = table.tableId;
    this.players = table.seats.map((s) => ({
      playerId: s.playerId,
      seatIndex: s.seatIndex,
      chips: s.chips,
      inHand: true,
      allIn: false,
      busted: false,
    }));
    this.sb = blinds.sb;
    this.bb = blinds.bb;
    // init timebanks for players
    this.players.forEach((p) => { this.actorTimebankMsByPlayer[p.playerId] = this.initialTimebankMs; });
  }

  /**
   * Adjust decision timing for this engine (admin/testing)
   */
  public setTiming(primaryMs: number, bankMs: number) {
    this.primaryDecisionMs = Math.max(200, Math.floor(primaryMs));
    this.initialTimebankMs = Math.max(0, Math.floor(bankMs));
    // update current actor deadline from now using new primary time
    if (this.street && this.street !== Street.Showdown) {
      this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
    }
    // ensure all players have at most the configured timebank
    Object.keys(this.actorTimebankMsByPlayer).forEach((pid) => {
      this.actorTimebankMsByPlayer[pid] = Math.min(this.actorTimebankMsByPlayer[pid] ?? 0, this.initialTimebankMs);
    });
  }

  /**
   * DEV-ONLY: Rig next hand (holes/board). Applied once on nextHand/deal.
   */
  public rig(deal: { holeBySeat?: Record<number, Card[]>; community?: Card[] }) {
    this.rigNext = { ...(deal || {}) };
  }

  /**
   * Set RNG for next deck shuffle (provably-fair). Applied on nextHand.
   */
  public setDeckRng(rng: () => number) {
    this.deckRng = rng;
  }

  public nextHand(blinds: { sb: number; bb: number }) {
    this.handNumber += 1;
    this.sb = blinds.sb;
    this.bb = blinds.bb;
    this.pot = 0;
    this.community = [];
    this.street = Street.Preflop;
    this.lastWinners = undefined;
    this.showdownInfo = undefined;
    this.deck = new DeckService(this.deckRng ?? undefined);
    this.deckRng = undefined; // consume once per hand
    this.players.forEach((p) => {
      p.inHand = !p.busted;
      p.allIn = false;
      // remove hole property entirely for exactOptionalPropertyTypes
      delete (p as any).hole;
    });
    this.dealHoleCards();
    this.postBlinds();
    // setup betting round
    this.minRaise = blinds.bb;
    // Heads-Up korrekt: Dealer ist SB, Nicht-Dealer ist BB
    const sbIndex = this.dealerIndex;
    const bbIndex = (this.dealerIndex + 1) % this.players.length;
    this.actorSeatIndex = (bbIndex + 1) % this.players.length; // first to act preflop after blinds (SB/Button)
    this.lastToActSeatIndex = bbIndex; // BB schließt preflop
    this.actorDeadlineMs = Date.now() + this.primaryDecisionMs; // primary decision time
    this.runoutNextAtMs = 0;
    this.liveBetThisStreet = false;
    this.dbg('nextHand', { sb: this.sb, bb: this.bb, dealerIndex: this.dealerIndex });
  }

  private dealHoleCards() {
    const rig = this.rigNext?.holeBySeat || null;
    for (const p of this.players) {
      if (!p.inHand) continue;
      if (rig && rig[p.seatIndex]) {
        p.hole = rig[p.seatIndex] as Card[];
      } else {
        const { cards } = this.deck.draw(2);
        p.hole = cards;
      }
    }
  }

  private postBlinds() {
    // Heads-Up korrekt: Dealer ist Small Blind, Nicht-Dealer ist Big Blind
    const sbIndex = this.dealerIndex;
    const bbIndex = (this.dealerIndex + 1) % this.players.length;
    const sbPlayer = this.players[sbIndex]!;
    const bbPlayer = this.players[bbIndex]!;
    const sbAmt = Math.min(this.sb, sbPlayer.chips);
    const bbAmt = Math.min(this.bb, bbPlayer.chips);
    sbPlayer.chips -= sbAmt; this.pot += sbAmt;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;
    bbPlayer.chips -= bbAmt; this.pot += bbAmt;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;
    this.currentBet = bbAmt;
    this.committed = { [sbPlayer.playerId]: sbAmt, [bbPlayer.playerId]: bbAmt };
  }

  public advanceStreet() {
    if (this.street === Street.Preflop) {
      this.deck.burn();
      const draw = this.deck.draw(3).cards as Card[];
      const rigComm = this.rigNext?.community;
      if (rigComm && rigComm.length >= 3) {
        this.community.push(rigComm[0]!, rigComm[1]!, rigComm[2]!);
      } else {
        this.community.push(...draw);
      }
      this.street = Street.Flop;
      this.resetBettingForNewStreet();
      return;
    }
    if (this.street === Street.Flop) {
      this.deck.burn();
      const draw = this.deck.draw(1).cards as Card[];
      const rigComm = this.rigNext?.community;
      if (rigComm && rigComm.length >= 4) {
        this.community.push(rigComm[3]!);
      } else {
        this.community.push(...draw);
      }
      this.street = Street.Turn;
      this.resetBettingForNewStreet();
      return;
    }
    if (this.street === Street.Turn) {
      this.deck.burn();
      const draw = this.deck.draw(1).cards as Card[];
      const rigComm = this.rigNext?.community;
      if (rigComm && rigComm.length >= 5) {
        this.community.push(rigComm[4]!);
      } else {
        this.community.push(...draw);
      }
      this.street = Street.River;
      this.resetBettingForNewStreet();
      return;
    }
    if (this.street === Street.River) {
      this.street = Street.Showdown;
      this.resolveShowdown();
      // consume rig once at showdown
      this.rigNext = null;
      this.dbg('advanceStreet->showdown');
      return;
    }
  }

  private resetBettingForNewStreet() {
    this.committed = {};
    this.currentBet = 0;
    this.minRaise = this.bb;
    // first to act is left of dealer on postflop
    this.actorSeatIndex = (this.dealerIndex + 1) % this.players.length;
    // dealer (button) will be last to act to close an unchecked street
    this.lastToActSeatIndex = this.dealerIndex;
    this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
    // If any player is all-in, there is no more betting: run out automatically
    const live = this.players.filter((p) => p.inHand && !p.busted);
    const anyAllIn = live.some((p) => p.allIn);
    if (anyAllIn) {
      this.runOutToShowdown();
    }
    this.liveBetThisStreet = false;
    this.dbg('resetBettingForNewStreet', { street: this.street, actor: this.actorSeatIndex, lastToAct: this.lastToActSeatIndex });
  }

  private resolveShowdown() {
    const live = this.players.filter((p) => p.inHand && !p.busted && p.hole);
    const evals = live.map((p) => ({
      player: p,
      hand: evaluateBestFive([...(p.hole as Card[]), ...this.community]),
    }));
    evals.sort((a, b) => {
      if (b.hand.category !== a.hand.category) return b.hand.category - a.hand.category;
      for (let i = 0; i < a.hand.kickers.length; i += 1) {
        const diff = (b.hand.kickers[i] ?? 0) - (a.hand.kickers[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
    const best = evals[0];
    if (!best) return;
    const winners = evals.filter((e) => e.hand.category === best.hand.category && e.hand.kickers.join(',') === best.hand.kickers.join(','));
    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot - share * winners.length;
    this.lastWinners = winners.map((w, i) => ({
      playerId: w.player.playerId,
      amount: share + (i < remainder ? 1 : 0),
    }));
    for (let i = 0; i < winners.length; i++) {
      winners[i]!.player.chips += share + (i < remainder ? 1 : 0);
    }
    // showdown info (simple category text)
    const cat = (c: number) => ["","High Card","One Pair","Two Pair","Trips","Straight","Flush","Full House","Quads","Straight Flush"][c] || "";
    this.showdownInfo = evals.map((e) => ({ playerId: e.player.playerId, category: cat(e.hand.category) }));
    // mark busted players (0 chips) so nextHand excludes them
    this.players.forEach((p) => { if (p.chips <= 0) p.busted = true; });
    // Move dealer button
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    this.dbg('resolveShowdown', { winners: this.lastWinners, pot: this.pot });
  }

  private areAllLiveAllIn(): boolean {
    const live = this.players.filter((p) => p.inHand && !p.busted);
    if (live.length < 2) return false;
    return live.every((p) => p.allIn);
  }

  private isRunningOut = false;
  /** Schedule staged runout (flop→turn→river→showdown) so clients see each street; do not run to showdown in one go. */
  private runOutToShowdown() {
    if (this.isRunningOut || this.street === Street.Showdown) {
      this.dbg('runOutToShowdown:skip');
      return;
    }
    this.isRunningOut = true;
    this.runoutNextAtMs = Date.now() + this.runoutStepMs;
    this.dbg('runOutToShowdown:scheduled', { runoutNextAtMs: this.runoutNextAtMs });
  }

  public getPublic(): TablePublicState {
    // Compute bettingClosed: keine Live-Bet aktiv und aktueller Actor wäre lastToAct (bzw. niemand mehr kann agieren)
    const livePlayers = this.players.filter((p) => p.inHand && !p.busted);
    const anyAllIn = livePlayers.some((p) => p.allIn);
    const actor = this.players[this.actorSeatIndex];
    const actorCanAct = !!actor && actor.inHand && !actor.busted && !actor.allIn && this.street !== null && this.street !== Street.Showdown;
    const actorCommitted = actor ? (this.committed[actor.playerId] ?? 0) : 0;
    const toCall = Math.max(0, this.currentBet - actorCommitted);
    const noLiveBet = this.currentBet === 0 || toCall === 0; // aus Sicht Actor: kein offener Call
    const bettingClosed = this.street === Street.Showdown
      ? true
      : (this.street !== null && (
          // Wenn niemand sinnvoll agieren kann
          (!actorCanAct) ||
          // oder Actor ist lastToAct und es gibt keinen Live-Bet mehr
          (this.actorSeatIndex === this.lastToActSeatIndex && noLiveBet && !this.liveBetThisStreet)
        ));
    const allInLocked = anyAllIn && this.street !== null && this.street !== Street.Showdown;
    return {
      tableId: this.tableId,
      handNumber: this.handNumber,
      dealerIndex: this.dealerIndex,
      smallBlind: this.sb,
      bigBlind: this.bb,
      pot: this.pot,
      community: this.community.slice(),
      street: this.street,
      players: this.players.map((p) => ({
        playerId: p.playerId,
        seatIndex: p.seatIndex,
        chips: p.chips,
        inHand: p.inHand,
        allIn: p.allIn,
        busted: p.busted,
        ...(p.hole ? { hole: p.hole } : {}),
      })),
      lastWinners: this.lastWinners,
      showdownInfo: this.showdownInfo,
      bettingClosed,
      allInLocked,
    };
  }

  public getActionState(): ActionState | null {
    if (this.street === null || this.street === Street.Showdown) return null;
    const actor = this.players[this.actorSeatIndex]!;
    if (!actor.inHand || actor.allIn) {
      return null;
    }
    const committed = { ...this.committed };
    const actorCommitted = committed[actor.playerId] ?? 0;
    const toCall = Math.max(0, this.currentBet - actorCommitted);
    const legal: ActionState["legalActions"] = [] as any;
    const anyOpponentAllIn = this.players.some((p) => p.playerId !== actor.playerId && p.inHand && p.allIn);
    // Opponent all-in → actor may only check/call or fold; no raises allowed
    if (anyOpponentAllIn) {
      if (toCall > 0) {
        legal.push("fold", "call");
      } else {
        legal.push("check");
      }
      return {
        tableId: this.tableId,
        actorSeatIndex: this.actorSeatIndex,
        actorPlayerId: actor.playerId,
        currentBet: this.currentBet,
        minRaise: Math.max(this.minRaise, this.bb),
        committed,
        legalActions: legal,
        actorDeadlineMs: this.actorDeadlineMs,
        actorTimebankMs: this.actorTimebankMsByPlayer[actor.playerId] ?? 0,
      };
    }
    if (toCall > 0) {
      legal.push("fold", "call");
      legal.push("raise");
    } else {
      legal.push("check");
      legal.push("bet");
    }
    return {
      tableId: this.tableId,
      actorSeatIndex: this.actorSeatIndex,
      actorPlayerId: actor.playerId,
      currentBet: this.currentBet,
      minRaise: Math.max(this.minRaise, this.bb),
      committed,
      legalActions: legal,
      actorDeadlineMs: this.actorDeadlineMs,
      actorTimebankMs: this.actorTimebankMsByPlayer[actor.playerId] ?? 0,
    };
  }

  public applyAction(playerId: string, type: "fold"|"check"|"call"|"bet"|"raise", amount?: number) {
    const actor = this.players[this.actorSeatIndex]!;
    if (actor.playerId !== playerId) throw new Error("not actor");
    const actorCommitted = this.committed[playerId] ?? 0;
    const toCall = Math.max(0, this.currentBet - actorCommitted);
    const nextActor = () => {
      // move to next in-hand, non-busted player
      for (let i = 1; i <= this.players.length; i += 1) {
        const idx = (this.actorSeatIndex + i) % this.players.length;
        const p = this.players[idx]!;
        if (p.inHand && !p.busted && !p.allIn) { this.actorSeatIndex = idx; return; }
      }
    };

    if (type === "fold") {
      actor.inHand = false;
      // if only one remains, award pot
      const live = this.players.filter((p) => p.inHand && !p.busted);
      if (live.length === 1) {
        live[0]!.chips += this.pot;
        this.lastWinners = [{ playerId: live[0]!.playerId, amount: this.pot }];
        this.pot = 0;
        this.street = Street.Showdown;
        // align with resolveShowdown() side-effects: mark busted + rotate dealer
        this.players.forEach((p) => { if (p.chips <= 0) p.busted = true; });
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        this.dbg('action fold -> showdown (auto-win)', { winner: live[0]!.playerId, nextDealer: this.dealerIndex });
        return;
      }
      // after a fold, if actor was lastToAct, the next player becomes lastToAct implicitly; simply advance to next actor
      nextActor();
      this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
      this.dbg('action fold', { playerId, nextActor: this.players[this.actorSeatIndex]?.playerId });
      return;
    }

    if (type === "check") {
      if (toCall !== 0) throw new Error("cannot check facing bet");
      if (this.actorSeatIndex === this.lastToActSeatIndex) { this.dbg('action check closes street', { playerId }); this.advanceStreet(); return; }
      nextActor();
      this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
      this.dbg('action check', { playerId, nextActor: this.players[this.actorSeatIndex]?.playerId });
      return;
    }

    if (type === "call") {
      if (toCall <= 0) return;
      const pay = Math.min(toCall, actor.chips);
      actor.chips -= pay; this.pot += pay;
      this.committed[playerId] = actorCommitted + pay;
      if (actor.chips === 0) actor.allIn = true;
      // Close the betting round if caller faced a live bet/raise this street;
      // otherwise (e.g., SB completing to BB preflop) pass action to next player.
      if (this.liveBetThisStreet || this.actorSeatIndex === this.lastToActSeatIndex) {
        this.advanceStreet();
        // Any all-in → schedule runout to showdown (simplified HU, no sidepots)
        if (this.players.some((p) => p.inHand && !p.busted && p.allIn)) { this.runOutToShowdown(); }
        this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
        this.dbg('action call closes street', { playerId });
        return;
      }
      // Otherwise, pass action to the next player (e.g., BB after SB completed preflop in HU)
      nextActor();
      this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
      this.dbg('action call', { playerId, nextActor: this.players[this.actorSeatIndex]?.playerId });
      return;
    }

    if (type === "bet" || type === "raise") {
      let target = amount ?? 0; // absolute "to" amount for this player this street
      const minTarget = this.currentBet === 0 ? this.bb : this.currentBet + this.minRaise;
      const maxTarget = actorCommitted + actor.chips; // all-in cap
      // Allow short all-in: if player cannot reach minTarget, cap to all-in instead of error
      if (target < minTarget) {
        if (maxTarget <= minTarget) {
          target = maxTarget;
        } else {
          throw new Error("bet/raise too small");
        }
      }
      // Clamp overly large targets to the maximum realizable all-in amount
      if (target > maxTarget) target = maxTarget;
      const need = target - actorCommitted;
      const pay = Math.min(need, actor.chips);
      actor.chips -= pay; this.pot += pay;
      this.committed[playerId] = actorCommitted + pay;
      // update currentBet to the new amount the actor actually achieved this street
      const previousBet = this.currentBet;
      this.currentBet = Math.max(this.currentBet, this.committed[playerId]!);
      if (this.currentBet < target) this.currentBet = target;
      // track minRaise only if it is a full raise; short all-in does not reopen raising
      const raiseSize = previousBet === 0 ? this.currentBet : (this.currentBet - previousBet);
      const isFullRaise = target >= minTarget;
      if (isFullRaise) {
        this.minRaise = Math.max(this.bb, raiseSize);
        // bettor becomes last to act
        this.lastToActSeatIndex = this.actorSeatIndex;
      }
      this.liveBetThisStreet = true;
      if (actor.chips === 0) actor.allIn = true;
      nextActor();
      this.actorDeadlineMs = Date.now() + this.primaryDecisionMs;
      // Hinweis: kein Runout hier. Runout wird nach Call oder bei Street-Reset ausgelöst.
      this.dbg(type === 'bet' ? 'action bet' : 'action raise', { playerId, target, currentBet: this.currentBet, minRaise: this.minRaise, nextActor: this.players[this.actorSeatIndex]?.playerId });
      return;
    }
  }

  public tickTimeout(now: number): boolean {
    let changed = false;
    if (this.street === null) return false;
    // staged runout advance
    if (this.runoutNextAtMs && now >= this.runoutNextAtMs) {
      this.advanceStreet();
      changed = true;
      if (this.street === Street.Showdown) {
        this.runoutNextAtMs = 0;
        this.isRunningOut = false;
      } else {
        this.runoutNextAtMs = now + this.runoutStepMs;
      }
    }
    if (this.street === Street.Showdown) return changed;
    const actor = this.players[this.actorSeatIndex]!;
    if (!actor.inHand || actor.allIn) return false;
    if (now <= this.actorDeadlineMs) return false;
    // Consume timebank first
    const overdue = now - this.actorDeadlineMs;
    const actorBank = this.actorTimebankMsByPlayer[actor.playerId] ?? 0;
    if (actorBank > 0) {
      const use = Math.min(actorBank, overdue);
      this.actorTimebankMsByPlayer[actor.playerId] = actorBank - use;
      // nudge next check soon to deterministically consume bank and progress
      this.actorDeadlineMs = now + 250;
      return true;
    }
    // Fallback action: check if possible else fold
    const committed = this.committed[actor.playerId] ?? 0;
    const toCall = Math.max(0, this.currentBet - committed);
    if (toCall === 0) {
      this.applyAction(actor.playerId, "check");
    } else {
      this.applyAction(actor.playerId, "fold");
    }
    return true;
  }
}


