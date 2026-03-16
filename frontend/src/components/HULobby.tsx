import { useEffect, useState } from 'react'
import { connectWS, huStatus, huJoin, huLeave, huBotJoin, huBotStatus, huLeaderboard, huElo, huPostMatchLock, getProfile } from '../api'

const POST_MATCH_LOCK_SEC = 10

export default function HULobby({ wallet, onMatch }: { wallet: string; onMatch: (tableId: string) => void }) {
  const [queueSize, setQueueSize] = useState(0)
  const [joined, setJoined] = useState(false)
  const [leaders, setLeaders] = useState<any[]>([])
  const [eloMap, setEloMap] = useState<Record<string, number>>({})
  const [hint, setHint] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [online, setOnline] = useState(0)
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(null)

  useEffect(() => {
    const ws = connectWS((m: any) => {
      if (m?.type === 'tournament' && m.payload?.event === 'hu_match' && Array.isArray(m.payload.participants)) {
        if (m.payload.participants.includes(wallet)) {
          onMatch(m.payload.tableId)
        }
      }
    })
    try { sessionStorage.setItem('pg_wallet', wallet) } catch {}

    const poll = async () => {
      try {
        const s = await huStatus(wallet)
        setQueueSize(s.queueSize ?? 0)
        setOnline(s.online ?? 0)
        if (s.matchTableId) onMatch(s.matchTableId)
      } catch {}
      try {
        const lock = await huPostMatchLock(wallet)
        setLockUntilMs(lock.locked && typeof lock.lockedUntilMs === 'number' ? lock.lockedUntilMs : null)
      } catch {}
      try { setLeaders(await huLeaderboard()) } catch {}
      try {
        const e = await huElo()
        const map: Record<string, number> = {}
        ;(Array.isArray(e) ? e : []).forEach((r: any) => {
          if (r?.playerId && typeof r.rating === 'number') map[r.playerId] = r.rating
        })
        setEloMap(map)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => { ws.close(); clearInterval(id) }
  }, [wallet, onMatch])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (lockUntilMs == null || Date.now() >= lockUntilMs) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [lockUntilMs])
  const nowMs = Date.now()
  const locked = lockUntilMs != null && nowMs < lockUntilMs
  const lockRemainingSec = locked ? Math.max(0, Math.ceil((lockUntilMs - nowMs) / 1000)) : 0

  useEffect(() => {
    let dead = false
    if (wallet) {
      getProfile(wallet).then((r: any) => {
        if (!dead) setDisplayName(r?.profile?.username || r?.username || wallet)
      }).catch(() => { if (!dead) setDisplayName(wallet) })
    }
    return () => { dead = true }
  }, [wallet])

  const handleJoin = async () => {
    try {
      await huJoin(wallet)
      setJoined(true)
      setHint('Waiting for opponent...')
    } catch (e: any) {
      if (e?.locked && typeof e?.lockedUntilMs === 'number') {
        setLockUntilMs(e.lockedUntilMs)
        setHint(`Please wait ${POST_MATCH_LOCK_SEC}s before next match.`)
      } else {
        setHint('Join failed. Please retry.')
      }
    }
  }

  const handleLeave = async () => {
    try {
      await huLeave(wallet)
      setJoined(false)
      setHint('')
    } catch {
      setHint('Leave failed. Please retry.')
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Player info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#c7d2fe' }}>{displayName || wallet.slice(0, 10)}</span>
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#1e1b4b', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' }}>
            ELO {eloMap[wallet] ?? eloMap[displayName] ?? 1500}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#6b7fff' }}>{online} online</span>
      </div>

      {/* Matchmaking */}
      <div style={{
        background: 'rgba(107,127,255,0.06)', border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20,
      }}>
        {!joined ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#c7d2fe', marginBottom: 8 }}>Find a Match</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
              {queueSize > 0 ? `${queueSize} player${queueSize > 1 ? 's' : ''} waiting` : 'No one in queue yet - be the first!'}
            </div>
            {locked && (
              <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 10 }}>
                Next match in {lockRemainingSec}s
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ padding: '14px 40px', fontSize: 16, fontWeight: 800, borderRadius: 12 }}
              onClick={handleJoin}
              disabled={locked}
            >
              Start Matchmaking
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#a5b4fc', marginBottom: 8 }}>Searching...</div>
            <div className="matchmaking-pulse" style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
              background: 'rgba(139,92,246,0.3)', animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>{queueSize} in queue</div>
            <button className="btn" onClick={handleLeave} style={{ fontSize: 13 }}>Cancel</button>
          </>
        )}
        {hint && !joined && <div style={{ fontSize: 13, color: '#f87171', marginTop: 10 }}>{hint}</div>}
      </div>

      {/* Leaderboard */}
      <div style={{
        background: 'rgba(107,127,255,0.04)', border: '1px solid rgba(139,92,246,0.15)',
        borderRadius: 14, padding: 16,
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#c7d2fe', marginBottom: 12 }}>
          Leaderboard
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6, marginLeft: 8 }}>Top players qualify for $dOckie airdrops</span>
        </div>
        {leaders.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: 13 }}>No matches played yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leaders.slice(0, 10).map((r: any, i: number) => {
              const name = r.displayName || r.playerId
              const rating = r.elo ?? eloMap[name] ?? 1500
              const tier = rating >= 2200 ? 'POKERGOD' : rating >= 2000 ? 'Diamond' : rating >= 1800 ? 'Gold' : rating >= 1600 ? 'Silver' : 'Bronze'
              const matches = (r.matches ?? r.hands) ?? 0
              const wins = Number(r.wins || 0)
              const wr = matches > 0 ? Math.round((wins / matches) * 100) : 0
              const me = displayName && name === displayName
              const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `#${i + 1}`
              return (
                <div
                  key={name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 10, background: me ? 'rgba(139,92,246,0.1)' : 'transparent',
                    border: me ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                  }}
                >
                  <span style={{ width: 32, fontWeight: 800, color: i < 3 ? '#8b5cf6' : '#6b7280', fontSize: 13 }}>{medal}</span>
                  <span style={{ flex: 1, fontWeight: 700, color: '#e0e7ff' }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', minWidth: 40, textAlign: 'right' }}>{rating}</span>
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: '#1e1b4b', color: '#a5b4fc' }}>{tier}</span>
                  <span style={{ fontSize: 12, color: '#6b7fff', minWidth: 40, textAlign: 'right' }}>{wins}W</span>
                  <span style={{ fontSize: 12, opacity: 0.5, minWidth: 35, textAlign: 'right' }}>{wr}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Play vs Bot */}
      <div style={{
        marginTop: 16, padding: 16, borderRadius: 14, textAlign: 'center',
        background: 'rgba(107,127,255,0.04)', border: '1px solid rgba(139,92,246,0.12)',
      }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>No one around? Practice against a bot.</div>
        <button
          className="btn"
          style={{ padding: '10px 28px', fontSize: 14, fontWeight: 700 }}
          disabled={locked}
          onClick={async () => {
            try {
              await huBotJoin(wallet)
              setHint('Bot match starting...')
              const s: any = await huBotStatus(wallet)
              if (s?.matchTableId) onMatch(s.matchTableId)
            } catch (e: any) {
              if (e?.locked && typeof e?.lockedUntilMs === 'number') {
                setLockUntilMs(e.lockedUntilMs)
                setHint(`Please wait ${POST_MATCH_LOCK_SEC}s before next match.`)
              } else {
                setHint('Bot join failed. Please retry.')
              }
            }
          }}
        >
          Play vs Bot
        </button>
      </div>
    </div>
  )
}
