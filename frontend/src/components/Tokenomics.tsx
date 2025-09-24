export default function Tokenomics(){
  return (
    <div className="landing" style={{ textAlign:'left' }}>
      <h2>POKERGODS Tokenomics ($PPT)</h2>
      <p>Flywheel: $PPT trading volume on pump.fun → creator fees (kickbacks) → daily player rewards → more activity/visibility → repeat.</p>
      <p><b>No match rake:</b> 0% taken per match. Funding via Day Pass and cosmetics sinks.</p>

      <h3>Daily fee pool split (creator fees)</h3>
      <ul>
        <li><b>75% Players Pool</b>: paid out daily to top players by score.</li>
        <li><b>10% Buyback & Burn</b>: periodic buybacks and burns.</li>
        <li><b>10% Growth / Quests / Referrals</b>: acquisition and events.</li>
        <li><b>5% Ops / Treasury</b>: infra, security, maintenance.</li>
      </ul>
      <p style={{ opacity: 0.85 }}><i>Beta notice: All parameters are subject to change during testing.</i></p>

      <h3>Eligibility</h3>
      <p>Access requires holding $PPT (read‑only SPL balance scan). No approvals or tx required to play.</p>

      <h3>Player scoring (anti‑farm friendly)</h3>
      <ul>
        <li><b>Score</b> = ELO multiplier × (wins − losses) × opponent strength.</li>
        <li><b>Minimums</b>: at least 15 matches and 5 unique opponents per day.</li>
        <li><b>Best‑of‑20 per day</b>: only your best 20 match scores count (others are candidates).</li>
        <li><b>Per‑opponent cap</b>: max 3 counted matches versus the same opponent.</li>
        <li><b>Streak bonus</b>: +10% for a 5‑win streak.</li>
        <li><b>Holding boost</b>: +0–10% based on $PPT holding days (anti‑flip).</li>
      </ul>

      <h3>Day Pass (+20 candidates)</h3>
      <ul>
        <li><b>Pass cost</b>: 5,000 $PPT for the current UTC day.</li>
        <li><b>Effect</b>: adds +20 candidate matches to your pool (still only best 20 count).</li>
        <li><b>Limit</b>: up to 2 passes/day → up to 60 candidates; still only best 20 score.</li>
        <li><b>Pass split</b>: 20% to today’s Players Pool, 10% burn, 70% Treasury.</li>
        <li><b>UI</b>: shows “Counted 20/20 | Candidates 28/40”, resets at UTC.</li>
      </ul>
      <p style={{ opacity: 0.85 }}><i>Subject to change: Pass pricing/splits may be adjusted for balance.</i></p>

      <h3>Spice & gamification</h3>
      <ul>
        <li><b>Daily jackpot</b>: 2–5% of pool to a random Top‑100 (weighted by score).</li>
        <li><b>Creator boost days</b>: selected days send extra % to Players Pool.</li>
        <li><b>Seasonal badges</b>: cosmetic badges with tiny rakeback boost (1–2%).</li>
        <li><b>Community goals</b>: hit a volume target → +3% extra to Players Pool.</li>
      </ul>

      <h3>Payouts (illustrative)</h3>
      <p>Let daily fee pool be F. Players Pool = 0.75·F. Payouts are proportional to score shares.</p>
      <pre style={{ background:'rgba(0,0,0,0.25)', padding:10, borderRadius:8 }}>
TotalScore = sum(score_i over eligible players)
Payout_i = (score_i / TotalScore) * 0.75 * F
      </pre>

      <h3>Token sinks</h3>
      <ul>
        <li>Entry fees for special ladders or seasonal events.</li>
        <li>Cosmetics: card backs, felt themes, sound packs, name reservations.</li>
      </ul>

      <h3>Technical</h3>
      <ul>
        <li>Fee data via pump.fun/Helius indexing → treasury.</li>
        <li>Daily UTC snapshot: freeze scores, compute distribution.</li>
        <li>Claims via Merkle distributor (SPL) or direct airdrops.</li>
        <li><b>Automated burn</b>: pass payments route 10% to a burn escrow; a scheduled backend job
          periodically executes on‑chain burn transactions (publicly verifiable).</li>
      </ul>

      <h3>Transparency</h3>
      <ul>
        <li>Public pool page: today’s pool, yesterday’s distribution, burn vault address and burn txs.</li>
        <li>Rules and parameters versioned with effective dates.</li>
      </ul>
    </div>
  )
}


