import { useEffect, useState } from 'react'
import { adminLogin, listTables, huElo, adminResetSession, adminListProfiles } from '../api'

type ProfileRow = { coreId: string; displayName: string; avatarUrl: string }

export default function AdminPanel({ lobby: _lobby, setLobby: _setLobby, onSpectate }: { lobby: any, setLobby: (l:any)=>void, onSpectate: (tableId: string)=>void }) {
  const [token, setToken] = useState<string>(()=>{
    try { return sessionStorage.getItem('pg_admin_token') ?? '' } catch { return '' }
  })
  const [adminUser, setAdminUser] = useState<string>('')
  const [adminPass, setAdminPass] = useState<string>('')
  const [authErr, setAuthErr] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [tables, setTables] = useState<string[]>([])
  const [elo, setElo] = useState<Array<{ playerId: string, rating: number }>>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [copied, setCopied] = useState<string>('')

  useEffect(() => {
    if (!token) return
    const poll = async () => { try { setTables(await listTables(token)) } catch {} }
    const pollElo = async () => { try { setElo(await huElo()) } catch {} }
    const loadProfiles = async () => {
      try {
        const res = await adminListProfiles(token)
        setProfiles(res?.profiles || [])
      } catch {}
    }
    poll(); pollElo(); loadProfiles()
    const id = setInterval(poll, 2000)
    const id2 = setInterval(pollElo, 3000)
    return () => { clearInterval(id); clearInterval(id2) }
  }, [token])

  const copyId = (id: string) => {
    try { navigator.clipboard.writeText(id) } catch {}
    setCopied(id)
    setTimeout(() => setCopied(''), 1500)
  }

  const s = {
    card: { width: '100%', border: '1px solid rgba(139,92,246,0.25)', padding: 14, borderRadius: 12, background: 'rgba(10,14,30,0.95)', marginBottom: 14 } as const,
    heading: { fontSize: 15, fontWeight: 800, color: '#c4b5fd', marginBottom: 10 } as const,
    grid: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' } as const,
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {!token ? (
        <div style={s.card}>
          <h3 style={s.heading}>Admin Login</h3>
          <div style={s.grid}>
            <label>Username</label>
            <input value={adminUser} onChange={(e)=> setAdminUser(e.target.value)} placeholder="admin" />
            <label>Password</label>
            <input type="password" value={adminPass} onChange={(e)=> setAdminPass(e.target.value)} placeholder="password"
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).closest('div')?.querySelector('button')?.click() }}
            />
          </div>
          {authErr && <div style={{ color:'#ff9a9a', marginTop:6 }}>{authErr}</div>}
          <div style={{ marginTop:10 }}>
            <button onClick={async ()=>{
              try {
                const res = await adminLogin(adminUser.trim(), adminPass)
                if (res?.token) {
                  setToken(res.token)
                  try { sessionStorage.setItem('pg_admin_token', res.token) } catch {}
                  setAuthErr('')
                } else { setAuthErr('Login failed') }
              } catch (e:any) { setAuthErr(e?.message || 'Login failed') }
            }}>Login</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <button disabled={loading} onClick={async ()=>{
              setLoading(true)
              try {
                const r:any = await adminResetSession(token)
                alert(r?.ok ? 'Session leaderboard reset' : JSON.stringify(r))
              }
              catch(e:any){ alert(e?.message || 'Session reset failed') }
              finally { setLoading(false) }
            }}>Reset Session Leaderboard</button>
            <button onClick={()=>{ setToken(''); try { sessionStorage.removeItem('pg_admin_token') } catch {} }}>Logout</button>
          </div>

          {/* Registered Profiles */}
          <div style={s.card}>
            <div style={s.heading}>Registered Players ({profiles.length})</div>
            {profiles.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No profiles registered yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profiles.map((p) => (
                  <div key={p.coreId} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 10, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                    }}>
                      {p.avatarUrl
                        ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 14, fontWeight: 800 }}>{(p.displayName || '?').slice(0,2).toUpperCase()}</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#e0e7ff' }}>{p.displayName}</div>
                      <div style={{
                        fontSize: 11, color: '#64748b', fontFamily: 'monospace',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{p.coreId}</div>
                    </div>
                    <button
                      onClick={() => copyId(p.coreId)}
                      style={{
                        fontSize: 11, padding: '4px 8px', borderRadius: 6, flexShrink: 0,
                        background: copied === p.coreId ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.2)', color: copied === p.coreId ? '#22c55e' : '#a5b4fc',
                      }}
                    >
                      {copied === p.coreId ? 'Copied!' : 'Copy ID'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Tables */}
          <div style={s.card}>
            <div style={s.heading}>Active Tables</div>
            {tables.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No active tables.</div>
            ) : (
              <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                {tables.map((t)=> (
                  <li key={t} style={{ marginBottom: 4 }}>
                    <code style={{ fontSize: 12 }}>{t}</code>
                    <button style={{ marginLeft: 8, fontSize: 11 }} onClick={() => onSpectate(t)}>Spectate</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ELO */}
          <div style={s.card}>
            <div style={s.heading}>ELO Leaderboard</div>
            {elo.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No ELO data yet.</div>
            ) : (
              <ol style={{ margin: '0 0 0 16px', padding: 0 }}>
                {elo.slice(0,10).map((r)=> (
                  <li key={r.playerId} style={{ marginBottom: 2, fontSize: 13 }}>{r.playerId}: {r.rating}</li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  )
}
