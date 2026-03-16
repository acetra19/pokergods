import { useEffect, useState } from 'react'
import { huLeaderboard } from '../api'

type LeaderRow = {
  playerId: string
  displayName: string
  wins: number
  matches: number
}

export default function EloExplainer() {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    huLeaderboard()
      .then((data: any) => {
        if (cancelled) return
        const list: LeaderRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.rows)
          ? data.rows
          : []
        setRows(list)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load leaderboard.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="landing" style={{ textAlign: 'left' }}>
      <h2>ELO & Leaderboards</h2>
      <p>
        We use an ELO‑style rating for heads‑up matches. Ratings go up when you beat higher‑rated opponents and down when you lose.
      </p>

      <h3>Current Heads‑Up Leaderboard</h3>
      {loading ? (
        <p>Loading leaderboard…</p>
      ) : error ? (
        <p style={{ color: '#f87171' }}>{error}</p>
      ) : rows.length === 0 ? (
        <p>No ranked matches yet. Play a few 1v1 games to appear here.</p>
      ) : (
        <div className="leaderboard" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Matches</th>
                <th>Winrate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const winrate = r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0
                const rank = idx + 1
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
                return (
                  <tr key={r.playerId}>
                    <td>{medal}</td>
                    <td>{r.displayName || r.playerId.slice(0, 10)}</td>
                    <td>{r.wins}</td>
                    <td>{r.matches}</td>
                    <td>{winrate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: '1.5rem' }}>How it works</h3>
      <ul>
        <li>Each heads‑up match updates both players&apos; ratings.</li>
        <li>Winning against higher‑ranked opponents gives more points.</li>
        <li>We periodically reset or soft‑decay ratings to keep things fresh.</li>
      </ul>
    </div>
  )
}

