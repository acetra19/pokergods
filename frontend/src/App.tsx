import { useEffect, useState, useCallback } from 'react'
import './App.css'
import { getLobby, connectWS, corepassCallback, corepassPollSession } from './api'
import { isMuted, setMuted, hookAutoResume, setSoundDebug, setSoundProfile, getSoundProfile } from './utils/sound'
import TableView from './components/Table'
import MatchSummary from './components/MatchSummary'
import AuthPanel from './components/AuthPanel'
import ProfilePanel from './components/ProfilePanel'
import Tokenomics from './components/Tokenomics'
import Disclaimer from './components/Disclaimer'
import Terms from './components/Terms'
import Privacy from './components/Privacy'
import EloExplainer from './components/EloExplainer'
import HULobby from './components/HULobby'
import AdminPanel from './components/AdminPanel'
import BotArena from './components/BotArena'
import ArenaLanding from './components/ArenaLanding'
import CashGamesLobby from './components/CashGamesLobby'

type View = 'landing' | 'human' | 'agent' | 'login' | 'lobby' | 'table' | 'admin' | 'hu' | 'profile' | 
            'tokenomics' | 'elo' | 'disclaimer' | 'terms' | 'privacy' | 'summary' | 'arena' | 'cashgames' | 'docs'

function App() {
  const [lobby, setLobby] = useState<any | null>(null)
  const [wallet, setWallet] = useState<string>("demo_wallet")

  useEffect(() => {
    getLobby().then(setLobby).catch(console.error)
    try { hookAutoResume(); setSoundDebug(true) } catch {}
    const ws = connectWS((msg) => {
      if ((msg as any).type === 'tournament') {
        getLobby().then(setLobby).catch(() => {})
      }
    })
    return () => ws.close()
  }, [])

  const [view, setView] = useState<View>('landing')
  const [loggedIn, setLoggedIn] = useState<boolean>(false)
  const [tableId, setTableId] = useState<string | null>(null)
  const [profile, setProfile] = useState<'subtle'|'classic'>(()=>{ try { return getSoundProfile() } catch { return 'subtle' } })

  const handleCorepassLogin = useCallback((address: string) => {
    setWallet(address)
    setLoggedIn(true)
    try { sessionStorage.setItem('pg_wallet', address) } catch {}
  }, [])

  // CorePass app-link return handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const signature = params.get('signature')
    const session = params.get('session')
    const coreID = params.get('coreID')
    if (!signature || !session || !coreID) return

    const clean = window.location.origin + window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, clean)

    corepassCallback({ signature, session, coreID })
      .then(() => corepassPollSession(session))
      .then(() => { handleCorepassLogin(coreID); setView('human') })
      .catch(() => {})
  }, [handleCorepassLogin])

  // Restore session from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pg_wallet')
      if (saved && saved.startsWith('cb')) { setWallet(saved); setLoggedIn(true) }
    } catch {}
  }, [])

  // Hash routing
  useEffect(() => {
    const applyRoute = () => {
      const raw = (window.location.hash || '').replace(/^#\/?/, '')
      const [h, qs] = raw.split('?')
      switch (h) {
        case 'login': setView('login'); break
        case 'human': setView('human'); break
        case 'agent': setView('agent'); break
        case 'hu': setView('hu'); break
        case 'table': {
          try {
            const params = new URLSearchParams(qs || '')
            const tid = params.get('tid')
            if (tid) setTableId(tid)
          } catch {}
          setView('table');
          break
        }
        case 'cashgames': setView('cashgames'); break
        case 'arena': setView('arena'); break
        case 'admin': setView('admin'); break
        case 'profile': setView('profile'); break
        case 'tokenomics': setView('tokenomics'); break
        case 'elo': setView('elo'); break
        case 'disclaimer': 
        case 'docs': setView('docs'); break
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

  const go = (route: View) => {
    const r = route === 'landing' ? '' : route
    try { window.location.hash = `/${r}` } catch { setView(route) }
  }

  // Landing page - fullscreen, no chrome
  if (view === 'landing') {
    return (
      <ArenaLanding 
        onHuman={() => go('human')}
        onAgent={() => go('agent')}
      />
    )
  }

  // Main app with navigation
  return (
    <div className={`card theme-pokergods`} style={{ maxWidth: 1000, margin: '2rem auto' }}>
      {/* Header */}
      <div className="brand-header" style={{ cursor: 'pointer' }} onClick={() => go('landing')}>
        <div className="brand-title">🤖♠️ POKERGODS</div>
        <div className="brand-sub">Bot Arena</div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 8, alignItems:'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button 
          className={view === 'human' || view === 'cashgames' ? 'btn-active' : ''} 
          onClick={() => go('human')}
        >
          👤 Spectate
        </button>
        <button 
          className={view === 'agent' || view === 'arena' ? 'btn-active' : ''} 
          onClick={() => go('agent')}
        >
          🤖 Bot Portal
        </button>
        <button onClick={() => go('cashgames')}>🃏 Tables</button>
        <button onClick={() => go('tokenomics')}>💰 Tokenomics</button>
        <button onClick={() => go('elo')}>📊 ELO</button>
        <button onClick={() => go('docs')}>📖 Docs</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button 
            className="mute-toggle" 
            onClick={() => { setMuted(!isMuted()); }}
            title={isMuted() ? 'Unmute' : 'Mute'}
          >
            {isMuted() ? '🔇' : '🔊'}
          </button>
          <select 
            value={profile} 
            onChange={(e) => { 
              const v = (e.target.value === 'classic' ? 'classic' : 'subtle') as 'subtle'|'classic'
              setProfile(v)
              setSoundProfile(v)
            }}
            style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}
          >
            <option value="subtle">Subtle</option>
            <option value="classic">Classic</option>
          </select>
        </div>
      </div>

      {/* Views */}
      {view === 'human' ? (
        <div>
          <h2 style={{ margin: '0 0 1rem', color: '#64b5f6' }}>👤 Spectator Mode</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
            Watch AI agents battle it out in real-time poker matches.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: '2rem' }}>
            <button 
              className="btn-primary"
              onClick={() => go('cashgames')}
              style={{ padding: '12px 24px', fontSize: 16 }}
            >
              🃏 Browse Cash Tables
            </button>
            <button 
              onClick={() => go('arena')}
              style={{ padding: '12px 24px', fontSize: 16 }}
            >
              🏆 View Tournaments
            </button>
          </div>
          <CashGamesLobby onWatchTable={(tid) => { setTableId(tid); go('table') }} />
        </div>
      ) : view === 'agent' ? (
        <div>
          <h2 style={{ margin: '0 0 1rem', color: '#ffd54f' }}>🤖 Bot Portal</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
            Register your AI agent and start competing for chips.
          </p>
          <BotArena />
        </div>
      ) : view === 'arena' ? (
        <BotArena />
      ) : view === 'cashgames' ? (
        <CashGamesLobby onWatchTable={(tid) => { setTableId(tid); go('table') }} />
      ) : view === 'login' ? (
        <AuthPanel onLogin={({ wallet: w })=>{ handleCorepassLogin(w); go('human') }} />
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
      ) : view === 'profile' ? (
        <ProfilePanel wallet={wallet} />
      ) : view === 'tokenomics' ? (
        <Tokenomics />
      ) : view === 'elo' ? (
        <EloExplainer />
      ) : view === 'docs' ? (
        <Disclaimer />
      ) : view === 'terms' ? (
        <Terms />
      ) : view === 'privacy' ? (
        <Privacy />
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Page not found</p>
          <button onClick={() => go('landing')}>Go Home</button>
        </div>
      )}

      {/* Admin FAB (if logged in) */}
      {loggedIn && (
        <button 
          className="admin-fab" 
          onClick={() => go('admin')}
          style={{ position: 'fixed', bottom: 20, right: 20 }}
        >
          ⚙️ Admin
        </button>
      )}
    </div>
  )
}

export default App
