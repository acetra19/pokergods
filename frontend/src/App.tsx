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
  const [profile, setProfile] = useState<'subtle'|'classic'>(() => {
    try { return getSoundProfile() } catch { return 'subtle' }
  })

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

    const clean = window.location.origin + window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, clean)

    corepassCallback({ signature, session, coreID })
      .then(() => corepassPollSession(session))
      .then(() => { handleCorepassLogin(coreID); setView('hub') })
      .catch(() => {})
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

  const requireAuth = (target: View) => {
    if (!loggedIn) { go('login'); return }
    go(target)
  }

  // Landing — shown when not logged in
  if (view === 'landing' && !loggedIn) {
    return <Landing onEnter={() => go('login')} />
  }

  // CorePass login gate
  if (view === 'login' && !loggedIn) {
    return (
      <div className="card theme-pokergods" style={{ maxWidth: 480, margin: '4rem auto', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.5 }}>POKERGODS</div>
          <div style={{ color: '#a5b4fc', fontSize: 14, marginTop: 4 }}>Sign in to play</div>
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
    <div className="card theme-pokergods" style={{ maxWidth: 1000, margin: '2rem auto' }}>
      {/* Header */}
      <div className="brand-header" style={{ cursor: 'pointer' }} onClick={() => go('hub')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-title">POKERGODS</div>
          <div className="brand-sub">Heads-Up Poker on Core</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#a5b4fc' }}>
          <span title={wallet}>{wallet.slice(0, 8)}...{wallet.slice(-4)}</span>
          <button
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#c7d2fe' }}
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

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={view === 'hub' ? 'btn-active' : ''} onClick={() => go('hub')}>
          Play
        </button>
        <button className={view === 'cashgames' ? 'btn-active' : ''} onClick={() => go('cashgames')}>
          Tables
        </button>
        <button className={view === 'profile' ? 'btn-active' : ''} onClick={() => go('profile')}>
          Profile
        </button>
        <button className={view === 'tokenomics' ? 'btn-active' : ''} onClick={() => go('tokenomics')}>
          Tokenomics
        </button>
        <button className={view === 'elo' ? 'btn-active' : ''} onClick={() => go('elo')}>
          ELO
        </button>
        <button className={view === 'docs' ? 'btn-active' : ''} onClick={() => go('docs')}>
          Docs
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="mute-toggle"
            onClick={() => setMuted(!isMuted())}
            title={isMuted() ? 'Unmute' : 'Mute'}
          >
            {isMuted() ? '🔇' : '🔊'}
          </button>
          <select
            value={profile}
            onChange={(e) => {
              const v = (e.target.value === 'classic' ? 'classic' : 'subtle') as 'subtle' | 'classic'
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
      {view === 'hub' ? (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 0.5rem', color: '#c7d2fe' }}>Ready to play?</h2>
            <p style={{ opacity: 0.7, margin: 0 }}>Choose your mode below</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div
              style={{ background: 'rgba(107,127,255,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: 20, cursor: 'pointer', textAlign: 'center', transition: 'transform 120ms' }}
              onClick={() => go('hu')}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = '')}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>1v1</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6, color: '#c7d2fe' }}>Heads-Up Match</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Play against another human in a ranked heads-up match.</div>
            </div>
            <div
              style={{ background: 'rgba(107,127,255,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: 20, cursor: 'pointer', textAlign: 'center', transition: 'transform 120ms' }}
              onClick={() => go('cashgames')}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = '')}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🃏</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6, color: '#c7d2fe' }}>Cash Tables</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Join or spectate open tables with varying stakes.</div>
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

      {/* Admin FAB */}
      {loggedIn && (
        <button
          className="admin-fab"
          onClick={() => go('admin')}
          style={{ position: 'fixed', bottom: 20, right: 20 }}
        >
          Admin
        </button>
      )}
    </div>
  )
}

export default App
