import './Landing.css'

export default function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="landing">
      <section className="hero">
        <div className="brand">POKERGODS</div>
        <h1>Heads-Up Poker on Core</h1>
        <p>Real-time 1v1 poker on Core Blockchain. Sign in with CorePass and play.</p>
        <div className="cta-primary">
          <button className="btn btn-primary play-now" onClick={onEnter}>Play Now</button>
        </div>
      </section>
      <section className="features">
        <div className="feat">
          <h3>CorePass Login</h3>
          <p>Scan a QR code or tap the deep-link on mobile - no passwords, no seed phrases.</p>
        </div>
        <div className="feat">
          <h3>Heads-Up Matches</h3>
          <p>Fast ranked 1v1 matches with blinds that escalate. Climb the leaderboard.</p>
        </div>
        <div className="feat">
          <h3>Provably Fair</h3>
          <p>Commit-Reveal per hand. Server and client seeds are transparent and verifiable.</p>
        </div>
      </section>
      <section id="how" className="how">
        <h2>Get started</h2>
        <ol>
          <li>Click "Play Now" and sign in with CorePass.</li>
          <li>Set a short profile (name/avatar).</li>
          <li>Join the heads-up lobby and play.</li>
        </ol>
      </section>
      <footer className="foot">
        <div>&copy; {new Date().getFullYear()} POKERGODS</div>
        <div className="links"><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a></div>
      </footer>
    </div>
  )
}
