/**
 * POKERGODS Bot Arena - Cash Games Lobby
 * Browse and spectate cash game tables
 */

import { useEffect, useState } from 'react'
import { BACKEND } from '../api'

interface CashTable {
  tableId: string
  name: string
  stakes: string
  stakesName: string
  smallBlind: number
  bigBlind: number
  minBuyIn: number
  maxBuyIn: number
  maxPlayers: number
  playerCount: number
  status: string
  players: {
    botId: string
    botName: string
    seat: number
    chips: number
  }[]
}

interface Stakes {
  [key: string]: {
    sb: number
    bb: number
    name: string
  }
}

interface Props {
  onWatchTable: (tableId: string) => void
}

export default function CashGamesLobby({ onWatchTable }: Props) {
  const [tables, setTables] = useState<CashTable[]>([])
  const [stakes, setStakes] = useState<Stakes>({})
  const [selectedStakes, setSelectedStakes] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const url = selectedStakes === 'all' 
          ? `${BACKEND}/api/v1/bot/tables`
          : `${BACKEND}/api/v1/bot/tables?stakes=${selectedStakes}`
        
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setTables(data.tables || [])
          if (data.stakes) setStakes(data.stakes)
        }
        setLoading(false)
      } catch (e) {
        console.error('Failed to fetch tables:', e)
        setLoading(false)
      }
    }

    fetchTables()
    const interval = setInterval(fetchTables, 5000)
    return () => clearInterval(interval)
  }, [selectedStakes])

  const stakeColors: Record<string, string> = {
    micro: '#4caf50',
    low: '#2196f3',
    mid: '#9c27b0',
    high: '#ff9800',
    nosebleed: '#f44336',
  }

  return (
    <div className="cash-lobby" style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#ffd54f' }}>
            🃏 Cash Games
          </h1>
          <p style={{ margin: '0.25rem 0 0', opacity: 0.7, fontSize: 14 }}>
            Jump in anytime - no waiting for tournaments
          </p>
        </div>
      </div>

      {/* Stakes Filter */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        <FilterButton 
          label="All Stakes" 
          active={selectedStakes === 'all'}
          onClick={() => setSelectedStakes('all')}
        />
        {Object.entries(stakes).map(([key, stake]) => (
          <FilterButton
            key={key}
            label={`${stake.name} (${stake.sb}/${stake.bb})`}
            active={selectedStakes === key}
            onClick={() => setSelectedStakes(key)}
            color={stakeColors[key]}
          />
        ))}
      </div>

      {/* Tables Grid */}
      {loading ? (
        <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading tables...</p>
      ) : tables.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
        }}>
          <p style={{ fontSize: 18, opacity: 0.7 }}>No tables at this stake level</p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gap: 16, 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        }}>
          {tables.map(table => (
            <TableCard 
              key={table.tableId} 
              table={table} 
              color={stakeColors[table.stakes] || '#888'}
              onWatch={() => onWatchTable(table.tableId)}
            />
          ))}
        </div>
      )}

      {/* Stakes Legend */}
      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
      }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: 16, opacity: 0.8 }}>Stakes Guide</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {Object.entries(stakes).map(([key, stake]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ 
                width: 12, 
                height: 12, 
                borderRadius: 3, 
                background: stakeColors[key] || '#888' 
              }} />
              <span style={{ fontSize: 13 }}>
                <strong>{stake.name}</strong>: {stake.sb}/{stake.bb} blinds
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilterButton({ 
  label, 
  active, 
  onClick, 
  color = '#ffd54f' 
}: { 
  label: string
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: active ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)',
        background: active ? `${color}22` : 'transparent',
        color: active ? color : '#ccc',
        cursor: 'pointer',
        fontWeight: active ? 700 : 400,
        fontSize: 13,
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  )
}

function TableCard({ 
  table, 
  color, 
  onWatch 
}: { 
  table: CashTable
  color: string
  onWatch: () => void 
}) {
  const statusColors: Record<string, string> = {
    waiting: '#888',
    playing: '#4caf50',
    paused: '#ff9800',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 12,
      padding: '1rem',
      border: '1px solid rgba(255,255,255,0.1)',
      transition: 'all 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{table.name}</div>
          <div style={{ 
            display: 'inline-block',
            padding: '2px 8px', 
            borderRadius: 4, 
            background: `${color}22`,
            color,
            fontSize: 12,
            fontWeight: 600,
            marginTop: 4,
          }}>
            {table.stakesName}
          </div>
        </div>
        <div style={{ 
          padding: '4px 8px', 
          borderRadius: 4, 
          background: `${statusColors[table.status]}22`,
          color: statusColors[table.status],
          fontSize: 12,
          fontWeight: 600,
          height: 'fit-content',
        }}>
          {table.status.toUpperCase()}
        </div>
      </div>

      {/* Info */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: 8, 
        marginBottom: 12,
        fontSize: 13,
        opacity: 0.8,
      }}>
        <div>Blinds: {table.smallBlind}/{table.bigBlind}</div>
        <div>Players: {table.playerCount}/{table.maxPlayers}</div>
        <div>Min Buy: {table.minBuyIn}</div>
        <div>Max Buy: {table.maxBuyIn}</div>
      </div>

      {/* Players */}
      {table.players.length > 0 && (
        <div style={{ 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: 8, 
          padding: 8,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>SEATED</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {table.players.map(p => (
              <div key={p.botId} style={{ 
                fontSize: 12, 
                padding: '2px 6px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 4,
              }}>
                {p.botName} ({p.chips})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watch Button */}
      <button
        onClick={onWatch}
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: 8,
          border: table.playerCount > 0 ? '2px solid #ffd54f' : '1px solid rgba(255,255,255,0.2)',
          background: table.playerCount > 0 ? 'rgba(255,213,79,0.15)' : 'transparent',
          color: table.playerCount > 0 ? '#ffd54f' : '#888',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {table.playerCount > 0 ? '👁️ Watch Table' : 'Empty Table'}
      </button>
    </div>
  )
}
