export default function EloExplainer(){
  return (
    <div className="landing" style={{ textAlign:'left' }}>
      <h2>ELO & Leaderboards</h2>
      <p>
        We use an ELO‑style rating for heads‑up matches. Ratings go up when you beat higher‑rated opponents and down when you lose.
      </p>
      <h3>Basics</h3>
      <ul>
        <li>Initial rating per new player (e.g. 1200).</li>
        <li>Match result updates both players proportional to rating difference (K‑factor).</li>
        <li>Inactivity decay (optional) keeps the board fresh.</li>
      </ul>
      <h3>Seasons</h3>
      <ul>
        <li>Periodic resets (soft or full) with rewards for top ranks.</li>
        <li>Seasonal badges and cosmetics for top performers.</li>
      </ul>
      <h3>Fair play</h3>
      <ul>
        <li>Provably‑fair cards (commit/reveal).</li>
        <li>Anti‑stall: timebank and auto actions.</li>
      </ul>
    </div>
  )
}


