import { useEffect, useState } from 'react'
import { adminLogin, listTables, huElo, adminResetSession } from '../api'

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

  useEffect(() => {
    if (!token) return
    const poll = async () => { try { setTables(await listTables(token)) } catch {} }
    const pollElo = async () => { try { setElo(await huElo()) } catch {} }
    poll();
    pollElo();
    const id = setInterval(poll, 2000)
    const id2 = setInterval(pollElo, 3000)
    return () => { clearInterval(id); clearInterval(id2) }
  }, [token])

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
      {!token ? (
        <div style={{ width:'100%', border:'1px solid rgba(139,92,246,0.25)', padding:12, borderRadius:10, background:'rgba(10,14,30,0.95)' }}>
          <h3>Admin Login</h3>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:8, alignItems:'center' }}>
            <label>Username</label>
            <input value={adminUser} onChange={(e)=> setAdminUser(e.target.value)} placeholder="admin" />
            <label>Password</label>
            <input type="password" value={adminPass} onChange={(e)=> setAdminPass(e.target.value)} placeholder="password" />
          </div>
          {authErr && <div style={{ color:'#ff9a9a', marginTop:6 }}>{authErr}</div>}
          <div style={{ marginTop:10, display:'flex', gap:8 }}>
            <button onClick={async ()=>{
              try {
                const res = await adminLogin(adminUser.trim(), adminPass)
                if (res?.token) {
                  setToken(res.token)
                  try { sessionStorage.setItem('pg_admin_token', res.token) } catch {}
                  setAuthErr('')
                } else {
                  setAuthErr('Login failed')
                }
              } catch (e:any) {
                setAuthErr(e?.message || 'Login failed')
              }
            }}>Login</button>
          </div>
          <div style={{ marginTop:8, fontSize:12, opacity:0.85 }}>Tokens sind lokal gespeichert. Nach Login kannst du sofort Admin-Aktionen ausführen.</div>
        </div>
      ) : null}
      {token && (
      <button disabled={loading} onClick={async ()=>{
        setLoading(true)
        try {
          const r:any = await adminResetSession(token)
          alert(r?.ok ? 'Session leaderboard reset' : JSON.stringify(r))
        }
        catch(e:any){ console.error(e); alert(e?.message || 'Session reset failed') }
        finally { setLoading(false) }
      }}>Reset Session Leaderboard</button>
      )}
      {token && (
        <button onClick={()=>{ setToken(''); try { sessionStorage.removeItem('pg_admin_token') } catch {}; }}>Logout</button>
      )}
      <div style={{ marginTop:12, width:'100%', textAlign:'left' }}>
        <b>Active tables</b>
        {!token ? (
          <div style={{ opacity:0.8, marginTop:6 }}>Please log in to view.</div>
        ) : (
          <ul style={{ margin:'6px 0 0 16px' }}>
            {tables.map((t)=> (
              <li key={t}>
                <code>{t}</code>
                <button style={{ marginLeft:8 }} onClick={() => onSpectate(t)}>Spectate</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginTop:12, width:'100%', textAlign:'left' }}>
        <b>ELO leaderboard</b>
        {!token ? (
          <div style={{ opacity:0.8, marginTop:6 }}>Please log in to view.</div>
        ) : (
          <ol style={{ margin:'6px 0 0 16px' }}>
            {elo.slice(0,10).map((r)=> (
              <li key={r.playerId}>{r.playerId}: {r.rating}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}


