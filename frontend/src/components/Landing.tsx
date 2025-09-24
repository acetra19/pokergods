import { BACKEND } from '../api'
import './Landing.css'

export default function Landing({ onEnter }: { onEnter: ()=>void }){
  return (
    <div className="landing">
      <section className="hero">
        <div className="brand">POKERGODS</div>
        <h1>Heads‑Up Poker Room</h1>
        <p>Modern. Fair. Stylish. Fast 1v1 poker with provably‑fair mechanics and live leaderboards.</p>
        <div className="cta-primary">
          <button className="btn btn-primary play-now" onClick={onEnter}>Play Now</button>
        </div>
        <div className="cta-secondary">
          <a className="btn btn-ghost" href="#how">How it works</a>
          <a className="btn btn-ghost" href="#tokenomics">Tokenomics</a>
          <a className="btn btn-ghost" href="#elo">ELO</a>
        </div>
      </section>
      <section id="tokenomics" className="how">
        <h2>Tokenomics (flywheel)</h2>
        <p>Creator fees and token sinks (Day Pass + cosmetics) fund seasons and rewards without any per‑match rake.</p>
        <ul>
          <li><b>No match rake:</b> 0% taken per match.</li>
          <li><b>Daily creator‑fees split:</b> 75% Players Pool, 10% Buyback & Burn, 10% Growth/Quests, 5% Ops/Treasury.</li>
          <li><b>Day Pass payments (5k $PPT)</b>: 20% Players Pool, 10% Burn, 70% Treasury.</li>
          <li>Cosmetics and seasonal ladders act as token sinks.</li>
        </ul>
        <p style={{ opacity: 0.85 }}><i>Note: Beta/test parameters – subject to change without notice. See Disclaimer.</i></p>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight:800, marginBottom:6 }}>Daily Creator‑Fees Split</div>
          <svg viewBox="0 0 100 12" width="100%" height="32" preserveAspectRatio="none" aria-label="Daily split bar">
            <rect x="0" y="0" width="75" height="12" fill="#ffd54f" />
            <rect x="75" y="0" width="10" height="12" fill="#9b6cff" />
            <rect x="85" y="0" width="10" height="12" fill="#7ad06b" />
            <rect x="95" y="0" width="5" height="12" fill="#c9c9c9" />
          </svg>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6, fontSize:12 }}>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#ffd54f', borderRadius:2, marginRight:4 }} />75% Players</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#9b6cff', borderRadius:2, marginRight:4 }} />10% Buyback & Burn</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#7ad06b', borderRadius:2, marginRight:4 }} />10% Growth</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#c9c9c9', borderRadius:2, marginRight:4 }} />5% Treasury</span>
          </div>
        </div>
      </section>
      <section id="elo" className="how">
        <h2>ELO & Leaderboards</h2>
        <p>Climb by beating stronger opponents. Seasonal resets keep the board competitive.</p>
      </section>
      <section className="features">
        <div className="feat"><h3>Provably Fair</h3><p>Commit‑Reveal per hand. Server/Client seeds are transparent and verifiable.</p></div>
        <div className="feat"><h3>SPL Eligibility</h3><p>Read‑only wallet scan for your token minimum balance. No gas. No approvals.</p></div>
        <div className="feat"><h3>Leaderboards</h3><p>Wins and hands tracked live – compete with the community.</p></div>
      </section>
      <section id="how" className="how">
        <h2>Get started</h2>
        <ol>
          <li>Enter your wallet and click “Scan” – we check eligibility.</li>
          <li>Set a short profile (name/avatar).</li>
          <li>Join the heads‑up lobby and play.</li>
        </ol>
        <div className="mini-info">Backend: {BACKEND}</div>
      </section>
      <footer className="foot">
        <div>© {new Date().getFullYear()} POKERGODS</div>
        <div className="links"><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a></div>
      </footer>
    </div>
  )
}


