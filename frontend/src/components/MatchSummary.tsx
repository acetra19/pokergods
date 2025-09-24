import pgLogo from '../images/pokergods.png'

export default function MatchSummary() {
  let data: any = null
  try { data = JSON.parse(sessionStorage.getItem('pg_last_match') || 'null') } catch {}
  const winners = data?.winners || []
  const youWin = !!winners.find((w:any)=> w.playerId === data?.you)
  const nameOf = (pid: string) => {
    try {
      const raw = sessionStorage.getItem('pg_profile_cache')
      if (raw) {
        const cache = JSON.parse(raw)
        const hit = cache && cache[pid]
        if (hit && typeof hit.name === 'string') return hit.name
      }
    } catch {}
    return pid
  }
  const offset = 260 // push content and logo further down
  return (
    <div className="pg-curtain" style={{ pointerEvents:'none' }}>
      <div className="pg-summary" style={{
        pointerEvents:'auto', minHeight: 520,
        backgroundImage: `linear-gradient(rgba(10,2,22,0.85), rgba(10,2,22,0.92)), url(${pgLogo})`,
        backgroundRepeat: 'no-repeat', backgroundPosition:`center ${offset}px`, backgroundSize:'600px auto',
        display:'flex', alignItems:'flex-start', justifyContent:'center', padding:`${offset + 12}px 12px 24px`
      }}>
      <div className="overlay-content">
        <div style={{ fontWeight:800, marginBottom:8, fontSize: 22 }}>{youWin? 'Match Over – You Win!' : 'Match Over – You Lose'}</div>
        <div style={{ marginBottom:8 }}>Winners: {winners.map((w:any)=> `${(w.displayName || nameOf(w.playerId))} (+${w.amount})`).join(', ')}</div>
        {data?.showdownInfo && (<div style={{ fontSize:12, opacity:0.9 }}>{data.showdownInfo.map((s:any)=> `${(s.displayName || nameOf(s.playerId))}: ${s.category}`).join(' · ')}</div>)}
        <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
          <button className="btn" onClick={()=>{ try { sessionStorage.removeItem('pg_last_match'); (window as any).location.assign('/'); } catch {} }}>Quit</button>
          <button className="btn btn-success" onClick={()=>{ try { sessionStorage.removeItem('pg_last_match'); window.location.hash = '#/hu' } catch {} }}>Next Match</button>
          <button className="btn btn-primary" onClick={()=>{ try { window.location.hash = '#/hu' } catch {} }}>Check Leaderboard</button>
        </div>
        </div>
      </div>
    </div>
  )
}


