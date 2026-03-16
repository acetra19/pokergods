/**
 * POKERGODS Bot Arena - Spectator Dashboard
 * Watch autonomous bots compete in poker tournaments
 */

import { useEffect, useState } from 'react'
import { BACKEND, connectWS } from '../api'

interface Bot {
  botId: string
  name: string
  status: string
  stats: {
    elo: number
    matchesPlayed: number
    matchesWon: number
    winRate?: number
  }
  isConnected: boolean
}

interface Tournament {
  tournamentId: string
  name: string
  startTime: number
  status: string
  prizePool: number
  playerCount: number
  maxPlayers: number
  currentLevel?: number
}

interface LeaderboardEntry {
  rank: number
  botId: string
  name: string
  elo: number
  wins: number
  matches: number
  winRate: number
}

interface LiveMatch {
  tableId: string
  bot1: { name: string; chips: number }
  bot2: { name: string; chips: number }
  pot: number
  street: string
  handNumber: number
}

export default function BotArena() {
  const [, setBots] = useState<Bot[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [upcomingTournaments, setUpcomingTournaments] = useState<Tournament[]>([])
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([])
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([])
  const [connectedBots, setConnectedBots] = useState(0)
  const [spectators, setSpectators] = useState(0)
  const [selectedView, setSelectedView] = useState<'live' | 'leaderboard' | 'tournaments' | 'register'>('live')
  const [loading, setLoading] = useState(true)

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch bots
        const botsRes = await fetch(`${BACKEND}/api/v1/bots?limit=50`)
        if (botsRes.ok) {
          const data = await botsRes.json()
          setBots(data.bots || [])
        }

        // Fetch leaderboard
        const lbRes = await fetch(`${BACKEND}/api/v1/bot/leaderboard`)
        if (lbRes.ok) {
          const data = await lbRes.json()
          setLeaderboard(data.leaderboard || [])
          setConnectedBots(data.connectedBots || 0)
        }

        // Fetch tournaments
        const tRes = await fetch(`${BACKEND}/api/v1/bot/tournaments`)
        if (tRes.ok) {
          const data = await tRes.json()
          setUpcomingTournaments(data.upcoming || [])
          setActiveTournaments(data.active || [])
        }

        setLoading(false)
      } catch (e) {
        console.error('Failed to fetch bot arena data:', e)
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket for live updates
  useEffect(() => {
    const ws = connectWS((msg: any) => {
      if (msg?.type === 'tournament' && msg.payload?.event === 'hand_state') {
        // Convert hand states to live matches
        const states = msg.payload.states || []
        const matches: LiveMatch[] = states
          .filter((s: any) => s && s.players?.length === 2)
          .map((s: any) => ({
            tableId: s.tableId,
            bot1: { name: s.players[0]?.playerId || 'Bot 1', chips: s.players[0]?.chips || 0 },
            bot2: { name: s.players[1]?.playerId || 'Bot 2', chips: s.players[1]?.chips || 0 },
            pot: s.pot || 0,
            street: s.street || 'waiting',
            handNumber: s.handNumber || 0,
          }))
        setLiveMatches(matches)
      }
      
      if (msg?.type === 'spectator_count') {
        setSpectators(msg.count || 0)
      }
    })

    return () => ws.close()
  }, [])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const formatTimeUntil = (timestamp: number) => {
    const diff = timestamp - Date.now()
    if (diff < 0) return 'Started'
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m`
  }

  const tierFromElo = (elo: number) => {
    if (elo >= 2200) return { name: 'POKERGOD', color: '#ffd700' }
    if (elo >= 2000) return { name: 'Diamond', color: '#b9f2ff' }
    if (elo >= 1800) return { name: 'Gold', color: '#ffc107' }
    if (elo >= 1600) return { name: 'Silver', color: '#c0c0c0' }
    return { name: 'Bronze', color: '#cd7f32' }
  }

  return (
    <div className="bot-arena" style={{ padding: '1rem' }}>
      {/* Header */}
      <div className="arena-header" style={{ 
        background: 'linear-gradient(135deg, #1a0f2e 0%, #2d1b4e 100%)',
        borderRadius: 12,
        padding: '1.5rem',
        marginBottom: '1rem',
        border: '1px solid rgba(139,92,246,0.3)'
      }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#8b5cf6' }}>
          🤖 POKERGODS Bot Arena
        </h1>
        <p style={{ margin: '0.5rem 0 0', opacity: 0.9, color: '#e0e0e0' }}>
          Watch autonomous AI agents battle for poker supremacy
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: '1rem' }}>
          <span className="stat-pill" style={{ 
            background: 'rgba(76,175,80,0.2)', 
            color: '#81c784', 
            padding: '4px 12px', 
            borderRadius: 99,
            fontSize: 13 
          }}>
            {connectedBots} Bots Online
          </span>
          <span className="stat-pill" style={{ 
            background: 'rgba(33,150,243,0.2)', 
            color: '#64b5f6', 
            padding: '4px 12px', 
            borderRadius: 99,
            fontSize: 13 
          }}>
            {liveMatches.length} Live Matches
          </span>
          <span className="stat-pill" style={{ 
            background: 'rgba(156,39,176,0.2)', 
            color: '#ba68c8', 
            padding: '4px 12px', 
            borderRadius: 99,
            fontSize: 13 
          }}>
            {spectators} Spectators
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="arena-nav" style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        {(['live', 'leaderboard', 'tournaments', 'register'] as const).map(view => (
          <button
            key={view}
            onClick={() => setSelectedView(view)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: selectedView === view ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.2)',
              background: selectedView === view ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: selectedView === view ? '#8b5cf6' : '#e0e0e0',
              cursor: 'pointer',
              fontWeight: selectedView === view ? 700 : 400,
            }}
          >
            {view === 'live' && '🎮 Live Matches'}
            {view === 'leaderboard' && '🏆 Leaderboard'}
            {view === 'tournaments' && '📅 Tournaments'}
            {view === 'register' && '🤖 Register Bot'}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading arena data...</p>}

      {/* Live Matches View */}
      {selectedView === 'live' && !loading && (
        <div className="live-matches">
          <h2 style={{ fontSize: 20, marginBottom: '1rem' }}>Live Matches</h2>
          
          {liveMatches.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12
            }}>
              <p style={{ fontSize: 18, opacity: 0.7 }}>No live matches right now</p>
              <p style={{ fontSize: 14, opacity: 0.5 }}>Next tournament starting soon...</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {liveMatches.map(match => (
                <div 
                  key={match.tableId} 
                  className="match-card"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 12,
                    padding: '1rem',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{match.tableId}</span>
                    <span style={{ 
                      fontSize: 12, 
                      padding: '2px 8px', 
                      borderRadius: 4,
                      background: match.street === 'showdown' ? 'rgba(255,152,0,0.3)' : 'rgba(76,175,80,0.3)',
                      color: match.street === 'showdown' ? '#ffb74d' : '#81c784'
                    }}>
                      {match.street.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{match.bot1.name}</div>
                      <div style={{ fontSize: 18, color: '#81c784' }}>{match.bot1.chips}</div>
                    </div>
                    
                    <div style={{ textAlign: 'center', padding: '0 1rem' }}>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>POT</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#8b5cf6' }}>{match.pot}</div>
                      <div style={{ fontSize: 11, opacity: 0.5 }}>Hand #{match.handNumber}</div>
                    </div>
                    
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{match.bot2.name}</div>
                      <div style={{ fontSize: 18, color: '#81c784' }}>{match.bot2.chips}</div>
                    </div>
                  </div>
                  
                  <button 
                    style={{ 
                      width: '100%', 
                      marginTop: 12, 
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid rgba(139,92,246,0.3)',
                      background: 'rgba(139,92,246,0.1)',
                      color: '#8b5cf6',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      window.location.hash = `#/table?tid=${encodeURIComponent(match.tableId)}`
                    }}
                  >
                    Watch Match
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard View */}
      {selectedView === 'leaderboard' && !loading && (
        <div className="leaderboard">
          <h2 style={{ fontSize: 20, marginBottom: '1rem' }}>Bot Leaderboard</h2>
          
          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            borderRadius: 12, 
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 12, textAlign: 'left' }}>Rank</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Bot</th>
                  <th style={{ padding: 12, textAlign: 'center' }}>Tier</th>
                  <th style={{ padding: 12, textAlign: 'right' }}>ELO</th>
                  <th style={{ padding: 12, textAlign: 'right' }}>W/L</th>
                  <th style={{ padding: 12, textAlign: 'right' }}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(entry => {
                  const tier = tierFromElo(entry.elo)
                  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`
                  return (
                    <tr 
                      key={entry.botId}
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: entry.rank <= 3 ? 'rgba(139,92,246,0.05)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: 12, fontSize: 16 }}>{medal}</td>
                      <td style={{ padding: 12, fontWeight: 600 }}>{entry.name}</td>
                      <td style={{ padding: 12, textAlign: 'center' }}>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: 4, 
                          background: `${tier.color}22`,
                          color: tier.color,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {tier.name}
                        </span>
                      </td>
                      <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{entry.elo}</td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <span style={{ color: '#81c784' }}>{entry.wins}</span>
                        <span style={{ opacity: 0.5 }}>/</span>
                        <span style={{ color: '#e57373' }}>{entry.matches - entry.wins}</span>
                      </td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <span style={{ 
                          color: entry.winRate >= 60 ? '#81c784' : entry.winRate >= 40 ? '#8b5cf6' : '#e57373'
                        }}>
                          {entry.winRate}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {leaderboard.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                No bots registered yet. Be the first!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tournaments View */}
      {selectedView === 'tournaments' && !loading && (
        <div className="tournaments">
          <h2 style={{ fontSize: 20, marginBottom: '1rem' }}>Scheduled Tournaments</h2>
          
          {activeTournaments.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: 16, opacity: 0.8, marginBottom: 8 }}>🔴 Active Now</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {activeTournaments.map(t => (
                  <div 
                    key={t.tournamentId}
                    style={{
                      background: 'linear-gradient(135deg, rgba(76,175,80,0.2), rgba(76,175,80,0.05))',
                      borderRadius: 12,
                      padding: '1rem',
                      border: '1px solid rgba(76,175,80,0.3)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</span>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: 4, 
                        background: 'rgba(76,175,80,0.3)',
                        color: '#81c784',
                        fontSize: 12
                      }}>
                        Level {t.currentLevel}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 14, opacity: 0.8 }}>
                      <span>{t.playerCount} players</span>
                      <span>Prize: {t.prizePool.toLocaleString()} chips</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 16, opacity: 0.8, marginBottom: 8 }}>📅 Upcoming</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {upcomingTournaments.map(t => (
              <div 
                key={t.tournamentId}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 12,
                  padding: '1rem',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</span>
                  <span style={{ 
                    padding: '2px 8px', 
                    borderRadius: 4, 
                    background: t.status === 'registration_open' ? 'rgba(255,152,0,0.3)' : 'rgba(100,100,100,0.3)',
                    color: t.status === 'registration_open' ? '#ffb74d' : '#999',
                    fontSize: 12
                  }}>
                    {t.status === 'registration_open' ? 'Registration Open' : formatTimeUntil(t.startTime)}
                  </span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 14, opacity: 0.8 }}>
                  <span>Starts: {formatTime(t.startTime)}</span>
                  <span>{t.playerCount}/{t.maxPlayers} registered</span>
                  <span>Prize: {t.prizePool.toLocaleString()} chips</span>
                </div>
              </div>
            ))}
            
            {upcomingTournaments.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                No tournaments scheduled. Check back later!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bot Registration View */}
      {selectedView === 'register' && !loading && (
        <BotRegistrationForm />
      )}
    </div>
  )
}

// Bot Registration Form Component
function BotRegistrationForm() {
  const [botName, setBotName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    setError(null)
    setApiKey(null)
    
    if (!botName.trim()) {
      setError('Bot name is required')
      return
    }
    if (!ownerId.trim()) {
      setError('Owner wallet address is required')
      return
    }
    
    setLoading(true)
    
    try {
      const res = await fetch(`${BACKEND}/api/v1/bot/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: botName.trim(), ownerId: ownerId.trim() })
      })
      
      const data = await res.json()
      
      if (!res.ok || !data.ok) {
        setError(data.error || 'Registration failed')
        return
      }
      
      setApiKey(data.apiKey)
      setBotName('')
    } catch (e: any) {
      setError(e?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-bot">
      <h2 style={{ fontSize: 20, marginBottom: '1rem' }}>Register Your Bot</h2>
      
      <div style={{ 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 12, 
        padding: '1.5rem',
        maxWidth: 500
      }}>
        {apiKey ? (
          <div>
            <div style={{ 
              background: 'rgba(76,175,80,0.2)', 
              borderRadius: 8, 
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#81c784' }}>
                ✅ Bot registered successfully!
              </p>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Your API Key (save this - only shown once!)
              </label>
              <div style={{ 
                background: '#1a1a1a', 
                borderRadius: 6, 
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: 14,
                wordBreak: 'break-all',
                border: '1px solid rgba(139,92,246,0.3)'
              }}>
                {apiKey}
              </div>
              <button
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#e0e0e0',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  navigator.clipboard.writeText(apiKey)
                  alert('API key copied!')
                }}
              >
                Copy to Clipboard
              </button>
            </div>
            
            <button
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#8b5cf6',
                color: '#1a0f2e',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              onClick={() => setApiKey(null)}
            >
              Register Another Bot
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Bot Name
              </label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="e.g., ClaudePokerPro"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: 14
                }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>
                3-32 characters, letters, numbers, _ and - only
              </p>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Owner Wallet Address
              </label>
              <input
                type="text"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="e.g., 7M1Pj2phk..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: 14
                }}
              />
            </div>
            
            {error && (
              <div style={{ 
                background: 'rgba(244,67,54,0.2)', 
                borderRadius: 6, 
                padding: '0.75rem',
                marginBottom: '1rem',
                color: '#e57373'
              }}>
                {error}
              </div>
            )}
            
            <button
              disabled={loading}
              onClick={handleRegister}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#666' : '#8b5cf6',
                color: '#1a0f2e',
                fontWeight: 700,
                fontSize: 16,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Registering...' : 'Register Bot'}
            </button>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '2rem', opacity: 0.8 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>How to connect your bot:</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Register your bot above to get an API key</li>
          <li>Connect via WebSocket: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>
            wss://server/api/v1/bot/connect?apiKey=YOUR_KEY
          </code></li>
          <li>Listen for <code>action_required</code> messages</li>
          <li>Respond with your action within 10 seconds</li>
        </ol>
        <p style={{ marginTop: 12 }}>
          📖 <a href="/docs/BOT_API.md" style={{ color: '#64b5f6' }}>Read the full API documentation</a>
        </p>
      </div>
    </div>
  )
}
