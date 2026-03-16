import { useEffect, useState, useCallback } from 'react'
import './App.css'
import { getLobby, connectWS, corepassCallback, corepassPollSession } from './api'
import { isMuted, setMuted, hookAutoResume, setSoundDebug } from './utils/sound'
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
import CashGamesLobby from './components/CashGamesLobby'
import Landing from './components/Landing'

type View = 'landing' | 'login' | 'hub' | 'hu' | 'table' | 'cashgames' | 'profile' |
            'admin' | 'tokenomics' | 'elo' | 'docs' | 'terms' | 'privacy' | 'summary'

function App() {
  const [lobby, setLobby] = useState<any | null>(null)
  const [wallet, setWallet] = useState<string>('')
  const [loggedIn, setLoggedIn] = useState<boolean>(false)
  const [view, setView] = useState<View>('landing')
  const [tableId, setTableId] = useState<string | null>(null)

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

  const handleCorepassLogin = useCallback((address: string) => {
    setWallet(address)
    setLoggedIn(true)
    try { sessionStorage.setItem('pg_wallet', address) } catch {}
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const signature = params.get('signature')
    const session = params.get('session')
    const coreID = params.get('coreID')
    if (!signature || !session || !coreID) return

    // Clean URL: keep hash (e.g. #/login) but drop query params
    const clean = window.location.origin + window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, clean)

    corepassCallback({ signature, session, coreID })
      .then(() => corepassPollSession(session))
      .then(() => { handleCorepassLogin(coreID); setView('hub') })
      .catch(() => {
        // Fallback: even if callback fails, at least mark as logged in for UX
        handleCorepassLogin(coreID)
        setView('hub')
      })
  }, [handleCorepassLogin])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pg_wallet')
      if (saved && saved.startsWith('cb')) {
        setWallet(saved)
        setLoggedIn(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const applyRoute = () => {
      const raw = (window.location.hash || '').replace(/^#\/?/, '')
      const [h, qs] = raw.split('?')
      switch (h) {
        case 'login': setView('login'); break
        case 'hub': setView('hub'); break
        case 'hu': setView('hu'); break
        case 'table': {
          try {
            const params = new URLSearchParams(qs || '')
            const tid = params.get('tid')
            if (tid) setTableId(tid)
          } catch {}
          setView('table')
          break
        }
        case 'cashgames': setView('cashgames'); break
        case 'admin': setView('admin'); break
        case 'profile': setView('profile'); break
        case 'tokenomics': setView('tokenomics'); break
        case 'elo': setView('elo'); break
        case 'disclaimer':
        case 'docs': setView('docs'); break
        case 'terms': setView('terms'); break
        case 'privacy': setView('privacy'); break
        case 'summary': setView('summary'); break
        default: setView(loggedIn ? 'hub' : 'landing')
      }
    }
    applyRoute()
    const onChange = () => applyRoute()
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [loggedIn])

  const go = (route: View) => {
    const r = route === 'landing' ? '' : route
    try { window.location.hash = `/${r}` } catch { setView(route) }
  }

  // Landing — shown when not logged in
  if (view === 'landing' && !loggedIn) {
    return <Landing onEnter={() => go('login')} />
  }

  // CorePass login gate
  if (view === 'login' && !loggedIn) {
    return (
      <div className="card theme-pokergods pg-login-gate">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: 2, color: '#8b5cf6', textTransform: 'uppercase' }}>POKERGODS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 6 }}>Sign in to play</div>
        </div>
        <AuthPanel onLogin={({ wallet: w }) => { handleCorepassLogin(w); go('hub') }} />
      </div>
    )
  }

  // Redirect to hub if already logged in and on landing/login
  if ((view === 'landing' || view === 'login') && loggedIn) {
    setTimeout(() => go('hub'), 0)
    return null
  }

  return (
    <div className="card theme-pokergods pg-app-shell">
      {/* Header */}
      <div className="pg-header" onClick={() => go('hub')}>
        <div className="pg-header-left">
          <span className="pg-logo">PG</span>
          <span className="pg-header-wallet" title={wallet}>{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
        </div>
        <div className="pg-header-right">
          <button
            className="mute-toggle"
            onClick={(e) => { e.stopPropagation(); setMuted(!isMuted()) }}
          >
            {isMuted() ? '🔇' : '🔊'}
          </button>
          <button
            className="pg-logout"
            onClick={(e) => {
              e.stopPropagation()
              setLoggedIn(false); setWallet('')
              try { sessionStorage.removeItem('pg_wallet') } catch {}
              go('landing')
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Bottom tab bar on mobile, horizontal nav on desktop */}
      <nav className="pg-nav">
        <button className={view === 'hub' ? 'active' : ''} onClick={() => go('hub')}>Play</button>
        <button className={view === 'cashgames' ? 'active' : ''} onClick={() => go('cashgames')}>Tables</button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => go('profile')}>Profile</button>
        <button className={view === 'elo' ? 'active' : ''} onClick={() => go('elo')}>Rankings</button>
      </nav>

      <div className="pg-content">

      {/* Views */}
      {view === 'hub' ? (
        <div className="pg-hub">
          <div className="pg-hub-cards">
            <div className="pg-hub-card" onClick={() => go('hu')}>
              <div className="pg-hub-card-icon">1v1</div>
              <div className="pg-hub-card-title">Heads-Up Match</div>
              <div className="pg-hub-card-desc">Ranked match against another player.</div>
            </div>
            <div className="pg-hub-card" onClick={() => go('cashgames')}>
              <div className="pg-hub-card-icon">🃏</div>
              <div className="pg-hub-card-title">Cash Tables</div>
              <div className="pg-hub-card-desc">Join or spectate open tables.</div>
            </div>
          </div>
        </div>
      ) : view === 'hu' ? (
        <HULobby wallet={wallet} onMatch={(tid) => { setTableId(tid); go('table') }} />
      ) : view === 'table' ? (
        <TableView wallet={wallet} tableId={tableId ?? undefined} />
      ) : view === 'cashgames' ? (
        <CashGamesLobby onWatchTable={(tid) => { setTableId(tid); go('table') }} />
      ) : view === 'summary' ? (
        <MatchSummary />
      ) : view === 'admin' ? (
        <>
          <h2>Admin</h2>
          <AdminPanel lobby={lobby} setLobby={setLobby} onSpectate={(tid) => { setTableId(tid); go('table') }} />
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
          <button onClick={() => go('hub')}>Go Home</button>
        </div>
      )}

      </div>{/* end pg-content */}

      {/* Admin FAB */}
      {loggedIn && (
        <button
          className="admin-fab"
          onClick={() => go('admin')}
        >
          Admin
        </button>
      )}
    </div>
  )
}

export default App
