import { useEffect, useState } from 'react'
import { connectWS, huStatus, huJoin, huLeave, huLeaderboard, huBotJoin, huBotStatus, handHistory, handState, getProfile, huElo, huSessionStats, huLeague, huLeagueVs } from '../api'
import Modal from './Modal'

export default function HULobby({ wallet, onMatch }: { wallet: string, onMatch: (tableId:string)=>void }){
  const [queueSize, setQueueSize] = useState<number>(0)
  const [joined, setJoined] = useState<boolean>(false)
  const [leaders, setLeaders] = useState<any[]>([])
  const [hint, setHint] = useState<string>('')
  // show username from profile instead of wallet string
  const [displayName, setDisplayName] = useState<string>('')
  const [stakes, setStakes] = useState<'50/100'|'100/200'|'200/400'>('50/100')
  const [speed, setSpeed] = useState<'normal'|'fast'>('normal')
  const [openModal, setOpenModal] = useState<'leader'|'history'|'league'|'spectate'|null>(null)
  const [rowsLeader, setRowsLeader] = useState<any[]>([])
  const [eloMap, setEloMap] = useState<Record<string, number>>({})
  const [rowsHistory, setRowsHistory] = useState<any[]>([])
  const [online, setOnline] = useState<number>(0)
  const [sessionTop, setSessionTop] = useState<any|null>(null)
  const [sessionBB, setSessionBB] = useState<any|null>(null)
  const [tables, setTables] = useState<any[]>([])

  useEffect(()=>{
    const ws = connectWS((m:any)=>{
      if (m?.type==='tournament' && m.payload?.event==='hu_match' && Array.isArray(m.payload.participants)){
        if (m.payload.participants.includes(wallet)){
          onMatch(m.payload.tableId)
        }
      }
      if (m?.type==='tournament' && m.payload?.event==='hand_state'){
        // no-op
      }
    })
    try { sessionStorage.setItem('pg_wallet', wallet) } catch {}
    // Initial und periodisch Queue-Status laden
    const poll = async () => {
      try {
        const s = await huStatus(wallet)
        setQueueSize(s.queueSize ?? 0)
        setOnline(s.online ?? 0)
        if (s.matchTableId) {
          onMatch(s.matchTableId)
        }
      } catch {}
      try { setLeaders(await huLeaderboard()) } catch {}
      try {
        const e = await huElo();
        const map: Record<string, number> = {}
        ;(Array.isArray(e) ? e : []).forEach((r:any)=>{ if (r && typeof r.playerId==='string' && typeof r.rating==='number') map[r.playerId]=r.rating })
        setEloMap(map)
      } catch {}
      try {
        const st = await huSessionStats();
        setSessionTop(st?.topHand || null)
        setSessionBB(st?.badBeat || null)
      } catch {}
      // If we just redirected from a finished table, auto-open leaderboard modal once
      try {
        if (sessionStorage.getItem('pg_open_leader_once') === '1') {
          setRowsLeader(await huLeaderboard())
          try {
            const e = await huElo();
            const map: Record<string, number> = {}
            ;(Array.isArray(e) ? e : []).forEach((r:any)=>{ if (r && typeof r.playerId==='string' && typeof r.rating==='number') map[r.playerId]=r.rating })
            setEloMap(map)
          } catch {}
          setOpenModal('leader')
          sessionStorage.removeItem('pg_open_leader_once')
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return ()=> { ws.close(); clearInterval(id) }
  }, [wallet, onMatch])

  // Load profile name for current wallet
  useEffect(()=>{
    let dead = false
    const load = async () => {
      try {
        const r:any = await getProfile(wallet)
        if (!dead) setDisplayName((r && r.username) ? String(r.username) : (r?.profile?.username || wallet))
      } catch { if (!dead) setDisplayName(wallet) }
    }
    if (wallet) load()
    return ()=>{ dead = true }
  }, [wallet])

  return (
    <div className="hu-panel" style={{ border:'1px solid #e6e6e6', padding:12, borderRadius:10, position:'relative' }}>
      <h3>Heads-Up Lobby</h3>
      <div className="hu-precard" style={{ border:'1px solid #e6e6e6', borderRadius:10, padding:10, marginBottom:10 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span>Stakes</span>
            <select value={stakes} onChange={(e)=> setStakes(e.target.value as any)}>
              <option value="50/100">50/100</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span>Speed</span>
            <select value={speed} onChange={(e)=> setSpeed(e.target.value as any)}>
              <option value="normal">Normal</option>
            </select>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <span className="badge" style={{ padding:'4px 10px', borderRadius:999, background:'#1a0f2b', color:'#cbd5ff', fontSize:12, border:'1px solid rgba(140,140,255,0.25)' }}>Online: {online}</span>
            <button className="btn btn-primary" onClick={async ()=>{
              if (!wallet.trim()) { setHint('Please enter a wallet name first.'); return }
          try {
            await huJoin(wallet)
                setJoined(true)
            setHint(`Joined ${stakes} · ${speed}. Waiting…`)
          } catch { setHint('Join failed. Please retry.') }
        }}>Start Matchmaking</button>
            <button className="btn btn-success" onClick={async ()=>{
              if (!wallet.trim()) { setHint('Please enter a wallet name first.'); return }
              try {
                await huBotJoin(wallet)
                setJoined(true)
            setHint(`Bot match ${stakes} · ${speed}…`)
            const s:any = await huBotStatus(wallet)
                if (s?.matchTableId) onMatch(s.matchTableId)
          } catch { setHint('Bot join failed. Please retry.') }
        }}>Play vs Bot</button>
            <button className="btn" onClick={async ()=>{
              try { setRowsLeader(await huLeaderboard()) } catch { setRowsLeader([]) }
              setOpenModal('leader')
            }}>Leaderboard</button>
            <button className="btn" onClick={async ()=>{
              try { setRowsHistory(await handHistory()) } catch { setRowsHistory([]) }
              setOpenModal('history')
            }}>History</button>
            <button className="btn" onClick={async ()=>{
              try { const r = await huLeague(); setRowsLeader(r||[]) } catch { setRowsLeader([]) }
              setOpenModal('league')
            }}>League</button>
            <button className="btn" onClick={async ()=>{
              try { const s:any[] = await handState(); setTables(Array.isArray(s)? s:[]) } catch { setTables([]) }
              setOpenModal('spectate')
            }}>Spectate</button>
          </div>
        </div>
      </div>
      {/* duplicate controls removed to avoid repetition */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, justifyContent:'flex-start' }}>
        <span className="badge" style={{ padding:'4px 10px', borderRadius:999, background:'#2a1450', color:'#ffd54f', fontSize:13, border:'1px solid rgba(255,213,79,0.25)' }}>You: {displayName || wallet}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span className="badge" style={{ padding:'2px 8px', borderRadius:999, background:'#0b3c27', color:'#c7f3de', fontSize:12 }}>Waiting: {queueSize}</span>
        {joined && <span className="badge" style={{ padding:'2px 8px', borderRadius:999, background:'#184d34', color:'#e8f6ef', fontSize:12 }}>Joined</span>}
      </div>
      {hint && <div style={{ fontSize:12, color:'#555', marginBottom:6 }}>{hint}</div>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button data-testid="hu-join" onClick={async ()=>{
          if (!wallet.trim()) { setHint('Please enter a wallet name first.'); return }
          try {
            await huJoin(wallet)
            setJoined(true)
            setHint('Joined. Waiting for opponent...')
            const s = await huStatus(wallet)
            setQueueSize(s.queueSize ?? 0)
          } catch { setHint('Join failed. Please retry.') }
        }} disabled={joined}>Join</button>
        <button onClick={async ()=>{
          if (!wallet.trim()) { setHint('Please enter a wallet name first.'); return }
          try {
            await huBotJoin(wallet)
            setJoined(true)
            setHint('Bot match starting...')
            const s:any = await huBotStatus(wallet)
            if (s?.matchTableId) onMatch(s.matchTableId)
          } catch { setHint('Bot join failed. Please retry.') }
        }}>Play vs Bot</button>
        <button data-testid="hu-leave" onClick={async ()=>{
          try {
            await huLeave(wallet)
            setJoined(false)
            setHint('Left the queue.')
            const s = await huStatus(wallet)
            setQueueSize(s.queueSize ?? 0)
          } catch { setHint('Leave failed. Please retry.') }
        }} disabled={!joined}>Leave</button>
      </div>
      <div style={{ marginTop:12, textAlign:'left' }}>
        <b>Top players (session)</b>
        <ul className="hu-leaders" style={{ margin:'6px 0 0 14px', padding:0 }}>
          {leaders.slice(0,10).map((r:any, i:number)=> {
            const name = r.displayName || r.playerId
            const rating = eloMap[name] ?? 1500
            const tier = rating >= 2200 ? 'POKERGOD' : rating >= 2000 ? 'Diamond' : rating >= 1800 ? 'Gold' : rating >= 1600 ? 'Silver' : 'Bronze'
            const matches = (r.matches ?? r.hands) ?? 0
            const wins = Number(r.wins || 0)
            const wr = matches > 0 ? Math.min(100, Math.max(0, Math.round((wins / matches) * 100))) : 0
            const me = (displayName && name === displayName)
            const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : `#${i+1}`
            return (
              <li key={name} className={`leader-item rank-${i} ${me? 'me':''}`}>
                <div className="leader-left">
                  <span className="medal" title={`Rank ${i+1}`}>{medal}</span>
                  <span className="leader-name">{name}</span>
                  <span className="tier-pill">{tier}</span>
                </div>
                <div className="leader-right">
                  <span className="wins-pill">{wins}W</span>
                  <span className="matches-pill">{matches}M</span>
                </div>
                <div className="leader-bar"><span style={{ width: `${wr}%` }} /></div>
              </li>
            )
          })}
        </ul>
      </div>

      <div style={{ marginTop:12, textAlign:'left', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ border:'1px solid rgba(255,213,79,0.25)', borderRadius:8, padding:8 }}>
          <b>Top Hand</b>
          {sessionTop ? (
            <div style={{ marginTop:6 }}>
              <div><span className="pg-pill">{sessionTop.category}</span></div>
              <div style={{ fontSize:12, opacity:0.9 }}>by {sessionTop.displayName} · {sessionTop.tableId} · h{sessionTop.handNumber}</div>
            </div>
          ) : (
            <div style={{ marginTop:6, opacity:0.7 }}>—</div>
          )}
        </div>
        <div style={{ border:'1px solid rgba(255,213,79,0.25)', borderRadius:8, padding:8 }}>
          <b>Bad Beat</b>
          {sessionBB ? (
            <div style={{ marginTop:6 }}>
              <div style={{ fontSize:13 }}>
                <span className="pg-pill" style={{ marginRight:6 }}>{sessionBB.category}</span>
                vs <span className="pg-pill" style={{ marginLeft:6 }}>{sessionBB.winnerCategory}</span>
              </div>
              <div style={{ fontSize:12, opacity:0.9 }}>lost by {sessionBB.displayName} vs {sessionBB.winnerDisplayName} · Pot {sessionBB.pot}</div>
            </div>
          ) : (
            <div style={{ marginTop:6, opacity:0.7 }}>—</div>
          )}
        </div>
      </div>

      <Modal open={openModal==='leader'} title="Leaderboard" onClose={()=> setOpenModal(null)}>
        <table className="pg-table">
          <thead>
            <tr><th>Player</th><th>ELO</th><th>Tier</th><th>Wins</th><th>Matches</th></tr>
          </thead>
          <tbody>
            {rowsLeader.map((r:any)=> {
              const display = r.playerId
              const rating = eloMap[display] ?? 1500
              const tier = rating >= 2200 ? 'POKERGOD' : rating >= 2000 ? 'Diamond' : rating >= 1800 ? 'Gold' : rating >= 1600 ? 'Silver' : 'Bronze'
              return (
                <tr key={display}>
                  <td>{display}</td>
                  <td>{rating}</td>
                  <td><span className="pg-pill">{tier}</span></td>
                  <td><span className="pg-pill">{r.wins}</span></td>
                  <td>{r.matches ?? r.hands}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Modal>

      <Modal open={openModal==='league'} title="League Table" onClose={()=> setOpenModal(null)}>
        <table className="pg-table">
          <thead>
            <tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>M</th><th>Pts</th><th>vs</th></tr>
          </thead>
          <tbody>
            {rowsLeader.map((r:any, idx:number)=> (
              <tr key={r.playerId}>
                <td>{idx+1}</td>
                <td>{r.displayName||r.playerId}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.matches}</td>
                <td><span className="pg-pill">{r.points}</span></td>
                <td><button className="btn" onClick={async()=>{
                  try {
                    const vs = await huLeagueVs(r.playerId)
                    alert(vs.map((v:any)=> `${v.opponent}: ${v.wins}-${v.losses} (${v.matches})`).join('\n') || 'No data')
                  } catch {}
                }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <Modal open={openModal==='history'} title="Recent Hands" onClose={()=> setOpenModal(null)}>
        <div style={{ fontSize:12, opacity:0.95, marginBottom:6 }}>Letzte Hände</div>
        {(() => {
          const safe = Array.isArray(rowsHistory) ? rowsHistory : []
          const display = safe.map((h:any)=>{
            const tableId = h?.tableId ?? h?.table ?? '-'
            const hand = h?.handNumber ?? h?.hand ?? '-'
            const pot = h?.pot ?? h?.totalPot ?? h?.amount ?? 0
            const winnersArr = h?.winners ?? h?.lastWinners ?? []
            const winners = Array.isArray(winnersArr) ? winnersArr.map((w:any)=> w?.displayName || w?.playerId || w?.id || '').filter(Boolean).join(', ') : ''
            const showArr = h?.showdownInfo ?? []
            const cats = Array.isArray(showArr) ? showArr.map((s:any)=> `${s?.displayName||s?.playerId||''}${s?.category?` (${s.category})`:''}`).filter(Boolean).join(' · ') : ''
            const ts = h?.timestamp ?? h?.ts ?? null
            const time = ts ? new Date(ts).toLocaleTimeString() : ''
            return { tableId, hand, winners, cats, pot, time }
          })
          if (display.length === 0) return <div style={{ opacity:0.8 }}>Keine Daten</div>
          return (
            <table className="pg-table">
              <thead>
                <tr><th>Table</th><th>Hand</th><th>Winners</th><th>Showdown</th><th>Pot</th><th>Time</th></tr>
              </thead>
              <tbody>
                {display.slice(0, 50).map((r, i)=> (
                  <tr key={`${r.tableId}-${r.hand}-${i}`}>
                    <td>{r.tableId}</td>
                    <td>{r.hand}</td>
                    <td>{r.winners || '-'}</td>
                    <td>{r.cats || '-'}</td>
                    <td><span className="pg-pill">{r.pot}</span></td>
                    <td>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })()}
      </Modal>

      <Modal open={openModal==='spectate'} title="Active Tables" onClose={()=> setOpenModal(null)}>
        {tables.length === 0 ? (
          <div style={{ opacity:0.8 }}>No active tables</div>
        ) : (
          <table className="pg-table">
            <thead>
              <tr><th>Table</th><th>Players</th><th>Street</th><th>Pot</th><th>Community</th><th></th></tr>
            </thead>
            <tbody>
              {tables.map((t:any)=>{
                const players = Array.isArray(t.players)? t.players.map((p:any)=> p.playerId).join(', '): '-'
                const street = t.street ?? '-'
                const pot = t.pot ?? 0
                const comm = Array.isArray(t.community)? t.community.length: 0
                return (
                  <tr key={t.tableId}>
                    <td>{t.tableId}</td>
                    <td>{players}</td>
                    <td>{street}</td>
                    <td><span className="pg-pill">{pot}</span></td>
                    <td>{comm}</td>
                    <td><button className="btn" onClick={()=>{ window.location.hash = `#/table?tid=${encodeURIComponent(t.tableId)}`; setOpenModal(null) }}>View</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  )
}


