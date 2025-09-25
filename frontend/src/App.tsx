import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { getLobby, register, connectWS } from './api'
import { isMuted, setMuted, hookAutoResume, setSoundDebug, setSoundProfile, getSoundProfile } from './utils/sound'
import TableView from './components/Table'
import MatchSummary from './components/MatchSummary'
import AuthPanel from './components/AuthPanel'
import ProfilePanel from './components/ProfilePanel'
import Landing from './components/Landing'
import Tokenomics from './components/Tokenomics'
import Disclaimer from './components/Disclaimer'
import Terms from './components/Terms'
import Privacy from './components/Privacy'
import EloExplainer from './components/EloExplainer'
import HULobby from './components/HULobby'
import AdminPanel from './components/AdminPanel'

function App() {
  const [lobby, setLobby] = useState<any | null>(null)
  const [wallet, setWallet] = useState<string>("demo_wallet")
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    getLobby().then(setLobby).catch(console.error)
    try { hookAutoResume(); setSoundDebug(true) } catch {}
    const ws = connectWS((msg) => {
      if ((msg as any).type === 'tournament') {
        setEvents((e) => [msg, ...e].slice(0, 10))
        getLobby().then(setLobby).catch(() => {})
      }
    })
    return () => ws.close()
  }, [])

  const startTime = useMemo(() => lobby ? new Date(lobby.startTimeMs).toLocaleString() : '', [lobby])

  const [view, setView] = useState<'landing'|'login'|'lobby'|'table'|'admin'|'hu'|'profile'|'tokenomics'|'elo'|'disclaimer'|'terms'|'privacy'|'summary'>('landing')
  const [loggedIn, setLoggedIn] = useState<boolean>(false)
  const [tableId, setTableId] = useState<string | null>(null)
  const [profile, setProfile] = useState<'subtle'|'classic'>(()=>{ try { return getSoundProfile() } catch { return 'subtle' } })

  // Hash routing
  useEffect(() => {
    const applyRoute = () => {
      const h = (window.location.hash || '').replace(/^#\/?/, '')
      switch (h) {
        case 'login': setView('login'); break
        case 'hu': setView('hu'); break
        case 'table': setView('table'); break
        case 'admin': setView('admin'); break
        case 'profile': setView('profile'); break
        case 'tokenomics': setView('tokenomics'); break
        case 'elo': setView('elo'); break
        case 'disclaimer': setView('disclaimer'); break
        case 'terms': setView('terms'); break
        case 'privacy': setView('privacy'); break
        case 'summary': setView('summary'); break
        default: setView('landing')
      }
    }
    applyRoute()
    const onChange = () => applyRoute()
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const go = (route: 'landing'|'login'|'hu'|'table'|'admin'|'profile'|'tokenomics'|'elo'|'disclaimer'|'summary') => {
    const r = route === 'landing' ? '' : route
    try { window.location.hash = `/${r}` } catch { setView(route) }
  }

  return (
    <div className={`card theme-pokergods`} style={{ maxWidth: 900, margin: '2rem auto' }}>
      <div className="brand-header">
        <div className="brand-title">POKERGODS</div>
        <div className="brand-sub">Heads‑Up Poker</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems:'center' }}>
        <button onClick={() => go(view==='landing' ? 'login' : 'landing')}>{view==='landing' ? 'Login' : 'Home'}</button>
        {loggedIn ? (
          <>
            <button className="btn-hu-arena" onClick={() => go('hu')}>Heads‑Up Arena</button>
            <button onClick={() => go('table')}>Table</button>
            <button onClick={() => go('profile')}>Profile</button>
            <button onClick={() => go('tokenomics')}>Tokenomics</button>
            <button onClick={() => go('elo')}>ELO</button>
            <button onClick={() => go('disclaimer')}>Disclaimer</button>
          </>
        ) : (
          <>
            <button onClick={() => go('tokenomics')}>Tokenomics</button>
            <button onClick={() => go('elo')}>ELO</button>
            <button onClick={() => go('disclaimer')}>Disclaimer</button>
          </>
        )}
        <button className="mute-toggle" onClick={()=>{ setMuted(!isMuted()); alert(isMuted()? 'Sound on' : 'Sound off') }}>{isMuted()? 'Unmute' : 'Mute'}</button>
        <select value={profile} onChange={(e)=>{ const v = (e.target.value === 'classic' ? 'classic' : 'subtle') as 'subtle'|'classic'; setProfile(v); setSoundProfile(v); }}>
          <option value="subtle">Subtle</option>
          <option value="classic">Classic</option>
        </select>
      </div>
      {view === 'landing' ? (
        <Landing onEnter={()=> go('login')} />
      ) : view === 'login' ? (
        <AuthPanel onLogin={({ wallet: w })=>{ setWallet(w); setLoggedIn(true); go('hu') }} />
      ) : view === 'table' ? (
        <TableView wallet={wallet} tableId={tableId ?? undefined} />
      ) : view === 'summary' ? (
        <MatchSummary />
      ) : view === 'hu' ? (
        <HULobby wallet={wallet} onMatch={(tid)=>{ setTableId(tid); go('table') }} />
      ) : view === 'admin' ? (
        <>
          <h2>Admin</h2>
          <AdminPanel lobby={lobby} setLobby={setLobby} onSpectate={(tid)=>{ setTableId(tid); go('table') }} />
        </>
      ) : (
        view === 'profile' ? (
          <ProfilePanel wallet={wallet} />
        ) : view === 'tokenomics' ? (
          <Tokenomics />
        ) : view === 'elo' ? (
          <EloExplainer />
        ) : view === 'disclaimer' ? (
          <Disclaimer />
        ) : view === 'terms' ? (
          <Terms />
        ) : view === 'privacy' ? (
          <Privacy />
        ) : (
        <>
          <h2>Daily Freeroll Lobby</h2>
          {!lobby && <p>Loading...</p>}
          {lobby && (
            <>
              <p><b>Name:</b> {lobby.name}</p>
              <p><b>Starts:</b> {startTime}</p>
              <p><b>State:</b> {lobby.state}</p>
              <p><b>Registered:</b> {lobby.registeredCount}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="wallet" />
                <button onClick={async () => {
                  try {
                    const res = await register(wallet)
                    const updated = await getLobby()
                    setLobby(updated)
                    alert(res.ok ? 'Registered' : 'Registration failed')
                  } catch (e) {
                    console.error(e)
                    alert('Registration error')
                  }
                }}>Register</button>
              </div>
            </>
          )}
          <h3>Live events</h3>
          <pre style={{ maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(events, null, 2)}</pre>
        </>
        )
      )}
      {loggedIn && (
        <button className="admin-fab" onClick={()=> go('admin')}>Admin</button>
      )}
    </div>
  )
}

export default App
