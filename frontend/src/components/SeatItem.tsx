import { memo, useMemo, type CSSProperties, type MutableRefObject } from 'react'
import { formatCardLabel } from '../utils/cards'
import { evaluateBestFive as evalClient, compareHands as cmpClient } from '../utils/hand'
import { getProfile } from '../api'

function HoleCard({ c }: { c: any }) {
  return <span className={`card-sm suit-${c.suit}`} data-suit={c.suit}>{formatCardLabel(c)}</span>
}

function HoleCardWrap({ front, revealed, glow }: { front: any; revealed: boolean; glow?: 'win' | 'lose' | 'tie' | null }) {
  return (
    <span className={`card-wrap ${revealed ? 'revealed' : ''} ${glow ? `glow glow-${glow}` : ''}`}>
      <span className="face-back"><span className="card-back-sm" /></span>
      <span className="face-front"><HoleCard c={front} /></span>
    </span>
  )
}

export type SeatItemProps = {
  seat: { playerId: string; seatIndex: number; chips: number }
  seatsLength: number
  seatStyle: CSSProperties
  player: any | null
  dealerIndex: number | null
  actionState: any | null
  wallet?: string
  remaining: number | null
  bankMs: number
  glowEpoch: number
  tableState: any
  // Extracted closure values
  nowMs: number
  street: string | null
  anyAllIn: boolean
  revealVillain: boolean
  revealedCount: number
  seatBloom: Record<string, number>
  hand: any
  profileNameCache: MutableRefObject<Record<string, { name: string; avatar?: string }>>
  profileEpoch: number
  setProfileEpoch: (fn: (v: number) => number) => void
  displayChipsRef: MutableRefObject<Record<string, number>>
  inRevealUIRef: MutableRefObject<boolean>
  committedRef: MutableRefObject<Record<string, number> | null>
  foldAnimation?: boolean
}

function SeatItemInner({
  seat, seatsLength, seatStyle, player, dealerIndex, actionState, wallet,
  remaining, bankMs, glowEpoch, tableState,
  nowMs, street, anyAllIn, revealVillain, revealedCount, seatBloom, hand,
  profileNameCache, profileEpoch, setProfileEpoch,
  displayChipsRef, inRevealUIRef, committedRef,
  foldAnimation = false,
}: SeatItemProps) {
  const isActor = !!actionState && actionState.actorSeatIndex === seat.seatIndex
  const isHero = !!wallet && seat.playerId === wallet
  const tablePlayer = useMemo(
    () => (tableState && Array.isArray(tableState.players)) ? tableState.players.find((p: any) => p.playerId === seat.playerId) : null,
    [tableState, seat.playerId],
  )
  const heroHole = isHero ? (tablePlayer?.hole ?? player?.hole ?? null) : null
  const showHole = isHero ? !!heroHole : (revealVillain ? !!(tablePlayer?.hole ?? player?.hole) : false)
  const isSB = dealerIndex != null && seatsLength === 2 && seat.seatIndex === dealerIndex
  const isBB = dealerIndex != null && seatsLength === 2 && seat.seatIndex !== dealerIndex

  let decPct = 0
  let bankMode = false
  let warnMode = false
  if (isActor && actionState) {
    const primaryRemaining = Math.max(0, (actionState.actorDeadlineMs as number) - nowMs)
    const PRIMARY_TOTAL = 20000
    decPct = Math.max(0, Math.min(100, 100 - Math.floor((primaryRemaining / PRIMARY_TOTAL) * 100)))
    warnMode = primaryRemaining > 0 && primaryRemaining <= 3000
    if (primaryRemaining <= 0) {
      bankMode = true
      const bankRem = Math.max(0, (actionState.actorTimebankMs as number) || 0)
      const BANK_TOTAL = 30000
      decPct = 100 - Math.floor((bankRem / BANK_TOTAL) * 100)
    }
  }

  let villainGlow: 'win' | 'lose' | 'tie' | null = null
  if (!isHero && revealVillain) {
    try {
      const community = (tableState?.community || []) as Array<{ suit: string; rank: number }>
      const hero = (tableState && wallet) ? (tableState.players?.find((p: any) => p.playerId === wallet) || null) : null
      const heroH = hero && hero.hole ? hero.hole as Array<{ suit: string; rank: number }> : null
      const villainHole = (tablePlayer?.hole ?? player?.hole) as Array<{ suit: string; rank: number }> | undefined
      const visibleComm = community.slice(0, Math.max(0, revealedCount))
      if (heroH && villainHole && heroH.length === 2 && villainHole.length === 2) {
        const heroEval = evalClient([...heroH, ...visibleComm] as any)
        const villEval = evalClient([...villainHole, ...visibleComm] as any)
        const diff = cmpClient(heroEval, villEval)
        if (diff > 0) villainGlow = 'win'
        else if (diff < 0) villainGlow = 'lose'
        else villainGlow = 'tie'
      }
    } catch { /* ignore eval errors */ }
  }

  const bloomActive = !!seatBloom[seat.playerId]

  const chipDisplay = (() => {
    const pid = seat.playerId
    const serverStack = player?.chips ?? seat.chips ?? 0
    const committedNow = Number(actionState?.committed?.[pid] ?? committedRef.current?.[pid] ?? (hand && (hand[0]?.showdownCommitted?.[pid] ?? hand[0]?.committed?.[pid])) ?? 0)
    const isAllInFlow = inRevealUIRef.current || anyAllIn || (hand && hand[0]?.allInLocked && hand[0]?.bettingClosed) || street === 'showdown'
    const useFrozen = isAllInFlow && Number.isFinite(displayChipsRef.current?.[pid])
    return useFrozen ? Number(displayChipsRef.current?.[pid]) : (isAllInFlow ? Math.max(0, serverStack - committedNow) : serverStack)
  })()

  const nameDisplay = (() => {
    const pid = seat.playerId
    const cached = profileNameCache.current[pid]
    if (cached) return cached.name
    getProfile(pid).then((r: any) => {
      const name = (r && r.profile && r.profile.username) ? String(r.profile.username) : pid
      const av = (r && r.profile && r.profile.avatarUrl) ? String(r.profile.avatarUrl) : undefined
      profileNameCache.current = { ...profileNameCache.current, [pid]: { name, avatar: av } }
      setProfileEpoch((v) => v + 1)
    }).catch(() => {})
    return pid
  })()

  const avatarRender = (() => {
    const cached = profileNameCache.current[seat.playerId]
    if (cached?.avatar) {
      return <img src={cached.avatar} alt="avatar" className="avatar" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
    }
    const dispName = cached?.name ?? seat.playerId
    const letters = (dispName || '').toString().trim().replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
    return <div className="avatar">{letters || (dispName || seat.playerId).toString().slice(0, 2).toUpperCase()}</div>
  })()

  const chipStackRender = (() => {
    const c = Math.min(6, chipDisplay > 2000 ? 6 : chipDisplay > 1000 ? 5 : chipDisplay > 500 ? 4 : 3)
    const cx = 32; const cy = 18
    return Array.from({ length: c }).map((_, i) => {
      const angle = (i / c) * (Math.PI * 2)
      const r = 8 + (i % 2)
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      const color = i % 3 === 0 ? 'blue' : (i % 3 === 1 ? 'green' : '')
      return <span key={i} className={`seat-chip ${color}`} style={{ left: x, top: y }} />
    })
  })()

  return (
    <div className={`seat ${isActor ? 'actor actor-pulse' : ''} ${bloomActive ? 'seat-bloom' : ''} ${foldAnimation ? 'fold-badge' : ''}`} style={seatStyle}>
      {foldAnimation && (
        <div className="fold-badge-pill" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: '0.12em', boxShadow: '0 4px 20px rgba(220,38,38,0.5), 0 0 0 2px rgba(255,255,255,0.3)', pointerEvents: 'none' }} aria-hidden>FOLD</div>
      )}
      {player?.allIn && (<div className="allin-badge" title="Player is all-in">ALL-IN</div>)}
      {street === 'preflop' && isSB && (<div className="blind-badge sb" title="Small Blind">SB</div>)}
      {street === 'preflop' && isBB && (<div className="blind-badge bb" title="Big Blind">BB</div>)}
      <div className={`row ${bloomActive ? 'row-bloom' : ''}`}>
        <div className="avatar-wrap">
          <svg className={`ring ${bankMode ? 'bank' : ''} ${warnMode ? 'warn' : ''}`} viewBox="0 0 44 44">
            <circle className="bg" cx="22" cy="22" r="20" />
            <circle className="fg" cx="22" cy="22" r="20" style={{ strokeDasharray: 2 * Math.PI * 20, strokeDashoffset: ((100 - decPct) / 100) * (2 * Math.PI * 20) }} />
          </svg>
          {avatarRender}
        </div>
        <div>
          <div style={{ fontWeight: 700 }} data-prof-epoch={profileEpoch}>{nameDisplay}</div>
          <div className={`chip-pill ${bloomActive ? 'chip-bloom' : ''}`}>{chipDisplay} chips</div>
        </div>
      </div>
      <div className={`decbar ${bankMode ? 'bank' : ''}`}><div className="fill" style={{ width: `${decPct}%` }} /></div>
      {isActor && (
        <div className="time-pill">
          {remaining && remaining > 0 ? `${remaining}s` : bankMs > 0 ? `TB ${Math.ceil(bankMs / 1000)}s` : '0s'}
        </div>
      )}
      <div className="seat-chips" aria-hidden>{chipStackRender}</div>
      {isHero ? (
        <div className="hole-wrap deal-in" style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {heroHole ? (
            heroHole.map((c: any, i: number) => (
              <span key={i}><HoleCardWrap front={c} revealed={true} /></span>
            ))
          ) : (
            <><span className="card-back-sm" /><span className="card-back-sm" /></>
          )}
        </div>
      ) : (
        <div className={`hole-wrap deal-in villain${foldAnimation ? ' fold-slide' : ''}`} style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {(tablePlayer?.hole ?? player?.hole) ? (
            showHole
              ? (tablePlayer?.hole ?? player?.hole).map((c: any, i: number) => (
                <span key={`${seat.seatIndex}-${i}-${glowEpoch}`}>
                  <HoleCardWrap front={c} revealed={true} glow={villainGlow} />
                </span>
              ))
              : (<><span className="card-back-sm" /><span className="card-back-sm" /></>)
          ) : (
            <><span className="card-back-sm" /><span className="card-back-sm" /></>
          )}
        </div>
      )}
      {dealerIndex === seat.seatIndex && (<div className="dealer">D</div>)}
    </div>
  )
}

export const SeatItem = memo(SeatItemInner, (prev, next) => {
  const prevIsActor = !!prev.actionState && prev.actionState.actorSeatIndex === prev.seat.seatIndex
  const nextIsActor = !!next.actionState && next.actionState.actorSeatIndex === next.seat.seatIndex
  return (
    prev.foldAnimation === next.foldAnimation &&
    prev.seat.playerId === next.seat.playerId &&
    prev.seat.seatIndex === next.seat.seatIndex &&
    JSON.stringify(prev.seatStyle) === JSON.stringify(next.seatStyle) &&
    prev.seat.chips === next.seat.chips &&
    prev.seatsLength === next.seatsLength &&
    prev.dealerIndex === next.dealerIndex &&
    (
      (prevIsActor || nextIsActor)
        ? (
          prev.actionState?.actorSeatIndex === next.actionState?.actorSeatIndex &&
          prev.actionState?.actorDeadlineMs === next.actionState?.actorDeadlineMs &&
          prev.actionState?.currentBet === next.actionState?.currentBet &&
          prev.actionState?.minRaise === next.actionState?.minRaise &&
          prev.bankMs === next.bankMs &&
          prev.remaining === next.remaining
        )
        : true
    ) &&
    prev.wallet === next.wallet &&
    prev.glowEpoch === next.glowEpoch &&
    prev.revealVillain === next.revealVillain &&
    prev.revealedCount === next.revealedCount &&
    prev.street === next.street &&
    prev.anyAllIn === next.anyAllIn &&
    prev.profileEpoch === next.profileEpoch &&
    (!!prev.player?.hole === !!next.player?.hole)
  )
})
