import { useEffect, useMemo, useRef, useState, memo, useCallback, type CSSProperties } from 'react'
import pgLogo from '../images/pokergods.png'
import type { TableState, BlindLevel } from '../types'
import { getSeating, getLevel, handState, handActionState, handAction, connectWS, getProfile } from '../api'
import { formatCardLabel } from '../utils/cards'
import { playChip, playDeal, playWin, resumeAudio, playWarnTick, playBankStart, playCheck, playLose, playOverlayCue, playShuffle } from '../utils/sound'
import { evaluateBestFive as evalClient, compareHands as cmpClient } from '../utils/hand'

const SOUND_COOLDOWN_MS: Record<string, number> = {
  chip: 180,
  deal: 120,
  win: 400,
  warn: 600,
  bank: 600,
  check: 200,
  overlayCue: 300,
}

const soundLastPlayed: Record<string, number> = {}

function playSound(key: keyof typeof SOUND_COOLDOWN_MS, fn: () => void) {
  const now = Date.now()
  const last = soundLastPlayed[key] ?? 0
  if (now - last < SOUND_COOLDOWN_MS[key]) return
  soundLastPlayed[key] = now
  fn()
}

export default function TableView({ wallet, tableId }: { wallet?: string, tableId?: string }) {
  const [tables, setTables] = useState<TableState[]>([])
  const [level, setLevel] = useState<BlindLevel | null>(null)
  const [hand, setHand] = useState<any[] | null>(null)
  const [actionState, setActionState] = useState<any | null>(null)
  const [chatOpen, setChatOpen] = useState<boolean>(false)
  const [chatLines, setChatLines] = useState<{ts:number,text:string,tableId:string|null}[]>([])
  const [toast, setToast] = useState<string>('')
  const [floatTexts, setFloatTexts] = useState<Array<{ id:string; text:string; x:number; y:number; size?:number }>>([])
  const [dealFx, setDealFx] = useState<Array<{ id:string; x:number; y:number; rot:number }>>([])
  const [stageAnimKey, setStageAnimKey] = useState<number>(0)
  const [actorAnimKey, setActorAnimKey] = useState<number>(0)
  const [, setWsStatus] = useState<'init'|'open'|'retrying'|'closed'>('init')
  const [riverPulse, setRiverPulse] = useState<number>(0)
  const [overlayCooldown, setOverlayCooldown] = useState<boolean>(false)
  const [seatBloom, setSeatBloom] = useState<Record<string, number>>({})
const [showEmoji, setShowEmoji] = useState(false)
  const [longPress, setLongPress] = useState<{active:boolean; start:number}>({ active:false, start:0 })
  // Freeze the bet/raise button label right after submit to avoid flicker back to default
  const [pendingBtnLabel, setPendingBtnLabel] = useState<string | null>(null)

  // Release pending label when the actor changes (server accepted action)
  useEffect(() => {
    setPendingBtnLabel(null)
  }, [actionState?.actorPlayerId])
  const longPressTimer = useRef<number | null>(null)
  const prevHandSig = useRef<string>('')
  const prevActionSig = useRef<string>('')
  const prevActionRef = useRef<any | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const prevCommLenRef = useRef<number>(0)
  const prevStreetRef = useRef<string | null>(null)
  const overlayHoldUntilMsRef = useRef<number>(0)
  const showdownStartMsRef = useRef<number>(0)
  const overlayStateRef = useRef<'idle'|'armed'|'visible'>('idle')
  const overlayShowAtMsRef = useRef<number>(0)
  const overlayShowTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const overlayDataRef = useRef<{ tableId: string; handNumber: number; winners: any[]; showdownInfo: any[] | null; matchEnd: boolean } | null>(null)
  // Prevent duplicate overlays for the same hand: remember last shown signature
  const lastOverlayShownRef = useRef<{ tableId: string; handNumber: number } | null>(null)
  // Track last winners signature to only react on the first winners emission per hand
  const lastWinnersSigRef = useRef<string>('')
  const [dealCountdown, setDealCountdown] = useState<number>(0)
  const [revealedCount, setRevealedCount] = useState<number>(0)
  const revealedCountRef = useRef<number>(0)
  useEffect(()=>{ revealedCountRef.current = revealedCount }, [revealedCount])
  // Clientseitiger Chip-Stand, der während Showdown bis zur vollständigen Reveal nicht vorgezogen wird
  const displayChipsRef = useRef<Record<string, number>>({})
  const committedRef = useRef<Record<string, number>>({})
  const feltRef = useRef<HTMLDivElement|null>(null)
  const [showOverlay, setShowOverlay] = useState<boolean>(false)
  const [sizingAmt, setSizingAmt] = useState<number | null>(null)
  const profileNameCache = useRef<Record<string,{ name: string; avatar?: string }>>({})
  const potFlightHandRef = useRef<number|null>(null)
  // Hold last table frame between win moment and overlay navigation to avoid flicker
  const postHoldUntilMsRef = useRef<number>(0)
  const tableSnapshotRef = useRef<any|null>(null)
  // Trigger re-render when profile cache updates (to show avatars/initials)
  const [profileEpoch, setProfileEpoch] = useState<number>(0)
  // Track match boundaries (tableId change)
  const prevTableIdRef = useRef<string | null>(null)
  const newMatchRef = useRef<boolean>(false)
  const lastShuffleAtRef = useRef<number>(0)
  const didMatchShuffleRef = useRef<boolean>(false)
  // simple deterministic pseudo random based on hand number
  const seededRand = (seed:number, salt:number=1) => {
    const x = Math.sin(seed * 9301 + salt * 49297) * 233280
    return x - Math.floor(x)
  }

  useEffect(() => {
    getSeating().then(setTables).catch(console.error)
    getLevel().then(setLevel).catch(console.error)
    handState().then(setHand).catch(() => {})
    const lvlId = setInterval(() => { getLevel().then(setLevel).catch(() => {}) }, 5000)
    // Poll hand state with an early boost, then settle to 1500ms; keep handles to avoid leaks across remounts
    let handPollId: any = null
    let switchTimeout: any = null
    const startPoll = (ms: number) => {
      try { if (handPollId) clearInterval(handPollId) } catch {}
      handPollId = setInterval(() => { handState().then(setHand).catch(() => {}) }, ms)
    }
    startPoll(400)
    switchTimeout = setTimeout(() => { startPoll(1500) }, 3500)
    // Ensure any stray legacy elements are removed (defensive)
    try { Array.from(document.querySelectorAll('.deck-stack')).forEach((el)=> el.parentElement?.removeChild(el)) } catch {}
    // Keep removing if something injects later
    let mo: MutationObserver | null = null
    try {
      mo = new MutationObserver((recs)=>{
        for (const r of recs) {
          r.addedNodes && Array.from(r.addedNodes).forEach((n:any)=>{
            try {
              if (n && n.nodeType === 1) {
                const el = n as HTMLElement
                if (el.classList && el.classList.contains('deck-stack')) { el.remove() }
                el.querySelectorAll && el.querySelectorAll('.deck-stack').forEach((x)=> (x as HTMLElement).remove())
              }
            } catch {}
          })
        }
      })
      mo.observe(document.documentElement, { childList: true, subtree: true })
    } catch {}
    setTimeout(()=>{ try { Array.from(document.querySelectorAll('.deck-stack')).forEach((el)=> el.parentElement?.removeChild(el)) } catch {} }, 300)
    setTimeout(()=>{ try { Array.from(document.querySelectorAll('.deck-stack')).forEach((el)=> el.parentElement?.removeChild(el)) } catch {} }, 900)
    const ws = connectWS((msg) => {
      const m = msg as any
      if (m?.type === 'tournament' && m.payload?.event === 'hand_state') {
        const states: any[] = Array.isArray(m.payload.states) ? m.payload.states : []
        // Select only the state for our current table (or the one we play on)
        const mine = (() => {
          // prefer explicit prop tableId
          if (tableId) {
            const hit = states.find((x:any)=> x && x.tableId === tableId)
            if (hit) return hit
          }
          // fallback: find state that contains our wallet
          if (wallet) {
            const hit = states.find((x:any)=> Array.isArray(x?.players) && x.players.some((p:any)=> p?.playerId === wallet))
            if (hit) return hit
          }
          return states[0] || null
        })()
        const sig = (()=>{
          try {
            if (!mine) return JSON.stringify(null)
            const x = mine
            return JSON.stringify({
              t: x.tableId,
              h: x.handNumber,
              s: x.street,
              p: x.pot,
              c: x.community,
              lw: Array.isArray(x.lastWinners) ? x.lastWinners.length : 0,
              sd: Array.isArray(x.showdownInfo) ? x.showdownInfo.length : 0,
            })
          } catch { return Math.random().toString() }
        })()
        if (sig !== prevHandSig.current) {
          prevHandSig.current = sig
          setHand(states)
        }
        // sound hooks + floating commentary
        if (mine) {
          const st = mine
          if (st.street === 'preflop' && st.community?.length === 0) {
            playSound('deal', () => { resumeAudio(); playDeal() })
            addFloat('New Hand', 38, 28)
          }
          if (st.street === 'flop' && st.community?.length === 3) {
            playSound('deal', () => playDeal())
            addFloat('Flop', 38, 28)
          }
          if (st.street === 'turn' && st.community?.length === 4) {
            playSound('deal', () => playDeal())
            addFloat('Turn', 38, 28)
          }
          if (st.street === 'river' && st.community?.length === 5) {
            playSound('deal', () => playDeal())
            addFloat('River', 38, 28)
            const stamp = Date.now()
            setRiverPulse(stamp)
            setTimeout(()=> {
              setRiverPulse((curr) => (curr === stamp ? 0 : curr))
            }, 1200)
          }
          if (st.lastWinners && st.lastWinners.length && st.street === 'showdown' && Array.isArray(st.showdownInfo) && st.showdownInfo.length>0) {
            playSound('win', () => { resumeAudio(); playWin() })
            addFloat('Showdown', 38, 28)
          }
        }
        // Display-Chips nur aktualisieren, wenn nicht mitten im Reveal eines Showdowns
        try {
          const st0: any = mine || null
          if (st0 && Array.isArray(st0.players)) {
            const serverCommLen = Array.isArray(st0.community) ? st0.community.length : 0
            const freezeActive = inRevealUIRef.current
            const allowUpdate = !freezeActive
            // Bei neuem Preflop immer setzen
            const isNewHand = (st0.street === 'preflop' && serverCommLen === 0)
            if (allowUpdate || isNewHand) {
              const nextMap: Record<string, number> = { ...displayChipsRef.current }
              const nextCommitted: Record<string, number> = { ...committedRef.current }
              st0.players.forEach((p: any) => {
                nextMap[p.playerId] = p.chips
                nextCommitted[p.playerId] = 0
              })
              displayChipsRef.current = nextMap
              committedRef.current = nextCommitted
            } else {
              // während Showdown keine Updates mehr übernehmen
              if (console && console.debug) console.debug('[chips-freeze] skip server update during reveal')
            }
          }
        } catch {}
      }
      if ((m as any)?.type === 'emoji') {
        try {
          const e = (m as any).payload
          const currId = (hand && hand[0]?.tableId) || renderTables[0]?.tableId
          if (e && e.tableId && currId && e.tableId === currId) {
            addFloat(String(e.emoji || '🙂'), 68, 24, 28)
          }
        } catch {}
      }
      if (m?.type === 'tournament' && m.payload?.event === 'action_state') {
        const list = Array.isArray(m.payload.states) ? m.payload.states : []
        const st = list.find((x:any)=> !!x) || null
        const sig = (()=>{
          if (!st) return ''
          try { return JSON.stringify({ a: st.actorSeatIndex, p: st.actorPlayerId, b: st.currentBet, r: st.minRaise, l: st.legalActions, d: st.actorDeadlineMs, c: st.committed }) } catch { return Math.random().toString() }
        })()
        if (sig !== prevActionSig.current) {
          prevActionSig.current = sig
          setActionState(st)
        }
        // Sound-Logik: nur bei relevanten Änderungen, nicht bei jedem Tick
        if (st) {
          const prev = prevActionRef.current
          const actorChanged = !prev || prev.actorSeatIndex !== st.actorSeatIndex
          const betChanged = !prev || prev.currentBet !== st.currentBet
          const committedChanged = (()=>{
            try { return JSON.stringify(prev?.committed||{}) !== JSON.stringify(st.committed||{}) } catch { return false }
          })()
          if (actorChanged || betChanged || committedChanged) {
            if (console && console.debug) console.debug('[sound-hook] chip change', { actorChanged, betChanged, committedChanged })
            playSound('chip', () => { resumeAudio(); playChip() })
          }
      // If any player is all-in, freeze display chips to their current committed stacks + remaining chips.
      try {
        const anyAllIn = !!(hand && hand[0]?.players?.some((p:any)=> p.allIn))
        if (anyAllIn && st && st.committed) {
          const st0 = hand && hand[0]
          const nextDisplay: Record<string, number> = { ...displayChipsRef.current }
          const nextCommitted: Record<string, number> = { ...committedRef.current }
          const players = (st0?.players || []) as any[]
          players.forEach((p:any) => {
            const committed = st.committed?.[p.playerId] ?? 0
            const remaining = Math.max(0, p.chips - committed)
            nextDisplay[p.playerId] = remaining
            nextCommitted[p.playerId] = committed
    })
          displayChipsRef.current = nextDisplay
          committedRef.current = nextCommitted
        }
      } catch {}
          // Calm pacing for all-in: show a brief banner when any player is all-in and actor switches
          const stAnyAllIn = !!(hand && hand[0]?.players?.some((p:any)=> p.allIn))
          if (stAnyAllIn && actorChanged) {
            setAllInBanner({ ts: Date.now(), actor: st.actorPlayerId })
            addFloat('All‑In!', 40, 34)
            setTimeout(()=>{
              setAllInBanner((prev)=> prev && (Date.now()-prev.ts>1400 ? null : prev))
            }, 1500)
          }
          // Timebank-Aktivierung: wenn die Bank erstmals zu laufen beginnt
          const bankActivated = prev && prev.actorPlayerId === st.actorPlayerId && (prev.actorTimebankMs ?? 30000) === 30000 && (st.actorTimebankMs ?? 30000) < 30000
          if (bankActivated) { if (console && console.debug) console.debug('[sound-hook] bank start'); playSound('bank', () => { resumeAudio(); playBankStart() }) }
          // Warn-Tick, wenn Primary-Zeit unter 3s fällt (nur einmal pro Actorwechsel)
          const primaryRemainingPrev = prev ? Math.max(0, (prev.actorDeadlineMs as number) - Date.now()) : null
          const primaryRemainingNow = Math.max(0, (st.actorDeadlineMs as number) - Date.now())
          const crossedWarn = (primaryRemainingPrev == null || primaryRemainingPrev > 3000) && primaryRemainingNow <= 3000
          if (crossedWarn) { if (console && console.debug) console.debug('[sound-hook] warn tick'); playSound('warn', () => { resumeAudio(); playWarnTick() }) }
          prevActionRef.current = st
        }
      }
      if (m?.type === 'chat' && m.payload?.timestamp && m.payload?.message) {
        setChatLines((prev)=> [{ ts: m.payload.timestamp, text: m.payload.message, tableId: (m.payload.tableId ?? null) }, ...prev].slice(0, 60))
        setToast(m.payload.message); setTimeout(()=> setToast(''), 1800)
      }
      
    }, (status)=>{ setWsStatus(status) })
    return () => { try { clearInterval(lvlId) } catch {}; try { if (handPollId) clearInterval(handPollId) } catch {}; try { if (switchTimeout) clearTimeout(switchTimeout) } catch {}; try { mo && mo.disconnect() } catch {}; ws.close() }
  }, [])

  // Live ticker for countdowns (Timebank)
  useEffect(()=>{
    const id = setInterval(()=> setNowMs(Date.now()), 500)
    return ()=> clearInterval(id)
  }, [])

  const myTable = useMemo(() => {
    // If hand data is missing (server already advanced), keep showing the last snapshot during post-hold window
    if (!hand || (Array.isArray(hand) && hand.length === 0)) {
      if (postHoldUntilMsRef.current > Date.now() && tableSnapshotRef.current) return tableSnapshotRef.current
      return null
    }
    if (tableId) {
      const ht = (hand as any[]).find((h:any)=> h && h.tableId === tableId)
      if (ht) return ht
    }
    if (wallet) {
      const hw = (hand as any[]).find((h:any)=> Array.isArray(h?.players) && h.players.some((p:any)=> p.playerId === wallet))
      if (hw) return hw
    }
    const live = (hand as any[])[0] ?? null
    if (live) return live
    if (postHoldUntilMsRef.current > Date.now() && tableSnapshotRef.current) return tableSnapshotRef.current
    return null
  }, [hand, wallet, tableId])
  // Detect new match (tableId change)
  useEffect(()=>{
    const currId = myTable?.tableId ?? null
    const prev = prevTableIdRef.current
    if (currId && currId !== prev) {
      newMatchRef.current = true
      didMatchShuffleRef.current = false
    }
    prevTableIdRef.current = currId
  }, [myTable?.tableId])

  // Ensure wallet is stored for WS identify
  useEffect(()=>{ try { if (wallet) sessionStorage.setItem('pg_wallet', wallet) } catch {} }, [wallet])
  const communityCards = useMemo(() => (myTable?.community) ?? [], [myTable])
  const pot = useMemo(() => (myTable?.pot) ?? 0, [myTable])
  const street = useMemo(() => (myTable?.street) ?? null, [myTable])
  const dealerIndex = useMemo(() => (myTable?.dealerIndex) ?? null, [myTable])
  const handNumber = useMemo(() => (myTable?.handNumber) ?? 0, [myTable])
  const anyAllIn = useMemo(() => !!(myTable?.players?.some((p:any)=> p.allIn)), [myTable])
  

  const streetKey = street ?? 'none'
  useEffect(() => { setStageAnimKey((v) => v + 1) }, [streetKey, handNumber])
  useEffect(() => { setActorAnimKey((v) => v + 1) }, [streetKey, actionState?.actorPlayerId])

  // Reset local sizing when actor changes
  useEffect(() => { setSizingAmt(null) }, [actionState?.actorPlayerId])
  const [allInBanner, setAllInBanner] = useState<{ ts:number, actor?:string }|null>(null)
  // Detect transition to (all-in locked AND betting closed) to add a pre-runout hold
  const prevAllInLockRef = useRef<boolean>(false)
  const nextRevealHoldMsRef = useRef<number>(0)
  useEffect(() => {
    const st = hand && hand[0]
    const allInLockClosed = !!(st && st.allInLocked && st.bettingClosed)
    const prev = prevAllInLockRef.current
    if (allInLockClosed && !prev) {
      // Hold includes trace animation (~1200ms) plus extra 1.3s as requested
      nextRevealHoldMsRef.current = 3300
      setAllInBanner({ ts: Date.now(), actor: undefined })
      // Immediately freeze display chips to current committed stacks (prevents early winner leak)
      try {
        if (st && Array.isArray(st.players)) {
          const nextMap: Record<string, number> = { ...displayChipsRef.current }
          const nextCommitted: Record<string, number> = { ...committedRef.current }
          st.players.forEach((p:any)=> {
            nextMap[p.playerId] = p.chips
            nextCommitted[p.playerId] = st.committed?.[p.playerId] ?? 0
          })
          displayChipsRef.current = nextMap
          committedRef.current = nextCommitted
        }
      } catch {}
      setTimeout(() => { setAllInBanner((b)=> b && (Date.now()-b.ts>1500 ? null : b)) }, 1500)
    }
    prevAllInLockRef.current = allInLockClosed
  }, [hand])

  // Additional hold when server jumps directly to showdown (preflop all-in case)
  useEffect(() => {
    const currStreet = street as any
    const prevStreet = prevStreetRef.current
    if (currStreet === 'showdown' && prevStreet !== 'showdown') {
      // add extra 1300ms before starting our client reveal sequencer
      nextRevealHoldMsRef.current += 1300
      showdownStartMsRef.current = Date.now()
      // Snapshot commitments and freeze displays defensiv für Preflop-All‑In → Server springt direkt in Showdown
      try {
        const st0: any = hand && hand[0]
        if (st0 && Array.isArray(st0.players)) {
          const serverComm = (st0.showdownCommitted || st0.committed || {}) as Record<string, number>
          const nextCommitted: Record<string, number> = { ...committedRef.current }
          const nextDisplay: Record<string, number> = { ...displayChipsRef.current }
          st0.players.forEach((p:any) => {
            const stack = Number(p.chips || 0)
            // Wenn keine Commit-Daten vorhanden sind und der Spieler all-in ist → gesamter Stack als committed annehmen
            const serverVal = serverComm[p.playerId]
            const commit = (typeof serverVal === 'number' && Number.isFinite(serverVal))
              ? Number(serverVal)
              : (p.allIn ? stack : (nextCommitted[p.playerId] ?? 0))
            nextCommitted[p.playerId] = commit
            nextDisplay[p.playerId] = Math.max(0, stack - commit)
          })
          committedRef.current = nextCommitted
          displayChipsRef.current = nextDisplay
        }
      } catch {}
    }
    prevStreetRef.current = currStreet ?? null
  }, [street])

  // No JS staging to avoid flicker; CSS-only reveal handles stagger
  
  const isRealShowdown = useMemo(() => !!(myTable && myTable.street === 'showdown'), [myTable])
  const hasShowdownInfo = useMemo(() => !!(myTable && Array.isArray((myTable as any).showdownInfo) && (myTable as any).showdownInfo.length > 0), [myTable])
  const isShowdownReveal = useMemo(() => isRealShowdown && hasShowdownInfo, [isRealShowdown, hasShowdownInfo])
  const revealVillain = useMemo(() => isShowdownReveal, [isShowdownReveal])
  const inRevealUI = useMemo(() => isShowdownReveal, [isShowdownReveal])
  const inRevealUIRef = useRef(inRevealUI)
  useEffect(()=> { inRevealUIRef.current = inRevealUI }, [inRevealUI])

  // When entering reveal phase (all-in locked/showdown), freeze display chips for ALL players
  useEffect(() => {
    if (!inRevealUI) return
    try {
      const st0: any = hand && hand[0]
      if (!st0 || !Array.isArray(st0.players)) return
      const nextDisplay: Record<string, number> = { ...displayChipsRef.current }
      const comm = (st0.showdownCommitted || st0.committed || {}) as Record<string, number>
      st0.players.forEach((p: any) => {
        // Fallback auf unsere zuletzt bekannte Commit-Map, falls der Server in Showdown nichts mitsendet
        const committedFallback = Number(committedRef.current?.[p.playerId] ?? 0)
        const committed = Number((comm[p.playerId] ?? committedFallback) || 0)
        const remaining = Math.max(0, Number(p.chips || 0) - committed)
        nextDisplay[p.playerId] = remaining
      })
      displayChipsRef.current = nextDisplay
    } catch {}
  }, [inRevealUI, hand])

  // Remember previous community length for flip logic (must be AFTER declaration)
  useEffect(()=>{ prevCommLenRef.current = communityCards.length }, [communityCards.length])

  // Staged reveal for community cards (client-side sequencer)
  const triggerOverlay = useCallback((st:any) => {
    if (!st) return
    const winners = st.lastWinners
    if (!Array.isArray(winners) || !winners.length) return
    // Overlay nur bei echtem Showdown‑Matchende (nicht bei Fold‑Ends)
    const matchEnd = !!(st.players?.some((p:any)=> p.busted || (p.chips ?? 0) <= 0)) && st.street === 'showdown' && Array.isArray(st.showdownInfo) && st.showdownInfo.length>0
    if (!matchEnd) return
    const winnersSig = JSON.stringify(winners)
    const alreadyShown = !!(lastOverlayShownRef.current && lastOverlayShownRef.current.tableId === st.tableId && lastOverlayShownRef.current.handNumber === st.handNumber)
    if (alreadyShown) return
    lastOverlayShownRef.current = { tableId: st.tableId, handNumber: st.handNumber }
    lastWinnersSigRef.current = 'H'+st.handNumber+':'+winnersSig
    overlayDataRef.current = { tableId: st.tableId, handNumber: st.handNumber, winners, showdownInfo: st.showdownInfo ?? null, matchEnd }
    // snapshot current visible table to hold during handoff
    try { tableSnapshotRef.current = JSON.parse(JSON.stringify(st)) } catch { tableSnapshotRef.current = st }
    postHoldUntilMsRef.current = Date.now() + 1800
          try {
            const winnersEnriched = (st.lastWinners || []).map((w:any)=> ({ ...w, displayName: nameOf(w.playerId) }))
            const showdownEnriched = (st.showdownInfo || []).map((s:any)=> ({ ...s, displayName: nameOf(s.playerId) }))
            sessionStorage.setItem('pg_last_match', JSON.stringify({
              tableId: st.tableId,
              handNumber: st.handNumber,
              winners: winnersEnriched,
              showdownInfo: showdownEnriched,
              you: wallet
            }))
          } catch {}
          // Pre-overlay result blast kurz (~1.2s), blockiert Overlay nicht
          try {
            const youWin = !!(wallet && winners.some((w:any)=> w.playerId === wallet))
            const node = document.createElement('div')
            node.className = 'result-blast'
            node.textContent = youWin ? 'WIN!' : 'LOSE!'
            document.body.appendChild(node)
            try { resumeAudio(); (youWin ? playWin() : playLose()) } catch {}
            setTimeout(()=> { try { document.body.removeChild(node) } catch {} }, 1200)
          } catch {}
          // Overlay mit 1.8s Verzögerung zeigen (Tisch bleibt etwas länger sichtbar)
          setTimeout(()=>{
            setShowOverlay(true)
            overlayStateRef.current = 'visible'
            overlayHoldUntilMsRef.current = 0
          }, 1800)
          // Direkt zur Summary navigieren (kein Zwischen-Overlay im Table)
          setTimeout(()=> { try { window.location.hash = '#/summary' } catch {} }, 1800)
          // (Overlay-State ist bereits gesetzt)
  }, [])

  useEffect(() => {
    const isNewHand = (street === 'preflop' && communityCards.length === 0)
    if (isNewHand) {
      setRevealedCount(0)
      // sobald neuer Deal beginnt: Snapshot/Hold aufheben
      postHoldUntilMsRef.current = 0
      tableSnapshotRef.current = null
      // Reset reveal flags between hands
      try { inRevealUIRef.current = false } catch {}
      // Reset frozen chip displays/committed maps to avoid stale zeros at new hand
      try { displayChipsRef.current = {}; committedRef.current = {} } catch {}
      // subtle shuffle feedback
      try {
        const felt = feltRef.current
        if (felt) { felt.classList.remove('shuffle-once'); void felt.offsetWidth; felt.classList.add('shuffle-once') }
        const chips = document.querySelector('.chip-stack') as HTMLElement | null
        if (chips) { chips.classList.remove('flash-once'); void chips.offsetWidth; chips.classList.add('flash-once') }
      } catch {}
      // Only play shuffle when this client is actually seated in the table we render
      try {
        const render = renderTables[0]
        const amSeated = !!(render && Array.isArray((render as any).seats) && (render as any).seats.some((p:any)=> p?.playerId === wallet))
        const isNewMatch = !!newMatchRef.current
        if (amSeated && isNewMatch && !didMatchShuffleRef.current) {
          const now = Date.now()
          if (now - (lastShuffleAtRef.current || 0) > 900) {
            resumeAudio(); playShuffle(); lastShuffleAtRef.current = now
            didMatchShuffleRef.current = true
          }
        }
        newMatchRef.current = false
      } catch {}
      // Deal-in FX: spawn two small cards from center towards hero/villain anchor points
      try {
        const felt = feltRef.current as HTMLElement | null
        if (felt) {
          const feltRect = felt.getBoundingClientRect()
          const heroEl = document.querySelector('.seat-layer .seat-hero') as HTMLElement | null
          const villEl = document.querySelector('.seat-layer .seat-villain') as HTMLElement | null
          const targets: Array<{x:number;y:number;rot:number}> = []
          const pushTarget = (el: HTMLElement | null, fallbackY: number, baseRot: number) => {
            if (el) {
              const r = el.getBoundingClientRect()
              targets.push({ x: r.left + r.width/2 - (feltRect.left + feltRect.width/2), y: r.top + r.height/2 - (feltRect.top + feltRect.height/2), rot: baseRot })
              targets.push({ x: r.left + r.width/2 - (feltRect.left + feltRect.width/2) + 14, y: r.top + r.height/2 - (feltRect.top + feltRect.height/2) + 8, rot: baseRot - 10 })
            } else {
              targets.push({ x: 0, y: fallbackY, rot: baseRot })
              targets.push({ x: 12, y: fallbackY + 8, rot: baseRot - 10 })
            }
          }
          pushTarget(heroEl, 180, 6)
          pushTarget(villEl, -180, -6)
          setDealFx(targets.map(t => ({ id: Math.random().toString(36).slice(2), ...t })))
          setTimeout(() => setDealFx([]), 460)
        }
      } catch {}
      // Center table in viewport at match start
      try {
        const el = feltRef.current
        if (el && typeof el.scrollIntoView === 'function') {
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 60)
        }
      } catch {}
      // minimal, robust fade-in for hole cards (opacity only)
      try {
        const seats = Array.from(document.querySelectorAll('.seat .hole-wrap')) as HTMLElement[]
        seats.forEach((el) => {
          el.style.opacity = '0.001'
          el.style.willChange = 'opacity'
          requestAnimationFrame(() => {
            el.style.transition = 'opacity 160ms ease-out'
            el.style.opacity = '1'
            setTimeout(() => { el.style.transition = ''; el.style.willChange = ''; el.style.opacity = '' }, 240)
          })
        })
      } catch {}
      return
    }
    // reveal progressively until we match server state
    if (communityCards.length > revealedCount) {
      let i = revealedCount
      const step = () => {
        i += 1
        playSound('deal', () => { resumeAudio(); try { playDeal() } catch {} })
        setRevealedCount((v) => Math.min(communityCards.length, Math.max(v + 1, i)))
        if (i < communityCards.length) {
          // Slow down turn/river, especially when all-in
          // const remaining = communityCards.length - i
          let delay = 300
          const revealedSoFar = i
          if (revealedSoFar === 3) delay = anyAllIn ? 850 : 380 // post-flop settle
          else if (revealedSoFar === 4) delay = anyAllIn ? 1100 : 480 // turn
          else if (revealedSoFar === 5) delay = anyAllIn ? 1400 : 580 // river
          setTimeout(step, delay)
        } else {
          // full reveal reached; set overlay cue and schedule hold before server jump
          try { playSound('overlay', () => playOverlayCue()) } catch {}
          overlayShowAtMsRef.current = Date.now() + 1000
        }
      }
      const extra = nextRevealHoldMsRef.current; nextRevealHoldMsRef.current = 0
      const t = setTimeout(step, 300 + extra)
      return () => clearTimeout(t)
    }
    // clamp down if server reduced (new hand)
    if (communityCards.length < revealedCount) {
      setRevealedCount(communityCards.length)
    }

    // central overlay gating takes care of the trigger; avoid parallel triggers here
  }, [communityCards.length, street])

  // Overlay robuster triggern und Mindesthaltedauer garantieren (auch über Handwechsel hinweg)
  useEffect(() => {
    const now = Date.now()
    // Honor active hold for a visible overlay (independent of server state). If remaining==0 → infinite hold.
    if (overlayStateRef.current === 'visible') {
      const remaining = Math.max(0, (overlayHoldUntilMsRef.current || 0) - now)
      if (remaining > 0) {
        const id = setTimeout(() => {
          overlayHoldUntilMsRef.current = 0
          setOverlayCooldown(true)
          setTimeout(()=> setOverlayCooldown(false), 260)
                 setOverlayCooldown(true)
                 setTimeout(()=> setOverlayCooldown(false), 260)
                 setShowOverlay(false)
          overlayStateRef.current = 'idle'
          overlayDataRef.current = null
        }, remaining)
      return () => clearTimeout(id)
    }
    }
    const st = myTable
    // Reset duplicate guard and winners signature when a new hand number is seen
    try {
      const last = lastOverlayShownRef.current
      if (last && st && st.handNumber !== last.handNumber) {
        lastOverlayShownRef.current = null
        lastWinnersSigRef.current = ''
      }
    } catch {}
    const isShowdown = !!(st && st.street === 'showdown')
    const hasWinners = !!(st && st.lastWinners && (st.lastWinners as any[]).length > 0)
    const serverCommLen = (st && st.community?.length) ?? 0
    // vollständige Client-Reveal-Deckung (nur für Lesbarkeit; isRiverFull nutzt sie implizit)
    // const fullRevealDone = serverCommLen >= 5 ? (revealedCount >= 5) : (revealedCount >= serverCommLen)
    const isMatchEnd = !!(st && st.players?.some((p:any)=> p.busted || (p.chips ?? 0) <= 0))
    const isRiverFull = serverCommLen >= 5 && revealedCount >= 5

    // Reset/cleanup if conditions for MATCH overlay not met, but never tear down a visible overlay
    if (!(isShowdown && hasWinners && isMatchEnd)) {
      if (overlayStateRef.current !== 'visible') {
        overlayStateRef.current = 'idle'
        overlayShowAtMsRef.current = 0
        try { if (overlayShowTimerRef.current) { clearTimeout(overlayShowTimerRef.current) } } catch {}
        overlayShowTimerRef.current = null
        {
          overlayHoldUntilMsRef.current = 0
          if (showOverlay) {
            setOverlayCooldown(true)
            setTimeout(()=> setOverlayCooldown(false), 260)
                 setOverlayCooldown(true)
                 setTimeout(()=> setOverlayCooldown(false), 260)
                 setShowOverlay(false)
          }
        }
        overlayDataRef.current = null
      }
      return
    }

    // Erst anzeigen, wenn Client die serverseitig vorhandenen Community-Karten vollständig sichtbar hat
    // (River: 5 Karten → +1.5s Delay)
    const fullRevealDone = serverCommLen >= 5 ? (revealedCount >= 5) : (revealedCount >= serverCommLen)
    // Nur Match-Ende Overlays zulassen
    if (!isMatchEnd) {
      return
    }
    // Arm nur, wenn Winners neu emittiert wurden (erste Sichtung in dieser Hand)
    const winnersSig = (()=>{ try { return JSON.stringify(Array.isArray(st?.lastWinners)? st!.lastWinners : []) } catch { return Math.random().toString() } })()
    const winnersKey = 'H'+(st?.handNumber ?? 0)+':'+winnersSig
    if (lastWinnersSigRef.current === winnersKey) return
    if (!fullRevealDone) {
      // noch nicht vollständig sichtbar → Timer/Arming zurücksetzen, aber sichtbares Overlay nicht abräumen
      if (overlayStateRef.current !== 'visible') {
        overlayStateRef.current = 'idle'
        overlayShowAtMsRef.current = 0
        try { if (overlayShowTimerRef.current) { clearTimeout(overlayShowTimerRef.current) } } catch {}
        overlayShowTimerRef.current = null
      }
      return
    }

    // Arm/show overlay when winners are present; if river fully visible, delay by 1.5s
    {
      const baseDelay = isRiverFull ? 1500 : 0
      const desiredHold = isMatchEnd ? 5000 : (anyAllIn ? 3200 : 2600)

      if (overlayStateRef.current === 'idle') {
        // optional Cue beim Abschluss der River-Reveal
        if (isRiverFull) { playSound('overlayCue', () => { resumeAudio(); try { playOverlayCue() } catch {} }) }
        // If no base delay required (non-river or early win), show immediately to resist server hand switch
          if (baseDelay <= 0) {
          triggerOverlay(st)
          return
        }
        // Otherwise, arm and schedule with base delay (river case)
        overlayStateRef.current = 'armed'
        overlayShowAtMsRef.current = now + baseDelay
        try { if (overlayShowTimerRef.current) clearTimeout(overlayShowTimerRef.current) } catch {}
        overlayShowTimerRef.current = setTimeout(() => {
          if (overlayStateRef.current !== 'armed') return
          triggerOverlay(st)
        }, Math.max(0, overlayShowAtMsRef.current - Date.now()))
        return
      }

      if (overlayStateRef.current === 'visible') {
        // extend hold if needed, but never shorten
        if (overlayDataRef.current && st && overlayDataRef.current.tableId === st.tableId && overlayDataRef.current.handNumber === st.handNumber) {
          overlayHoldUntilMsRef.current = Math.max(overlayHoldUntilMsRef.current || 0, now + desiredHold)
        }
      }
    }

    // Overlay bis Ablauf halten – auch wenn der Server bereits zur nächsten Hand gewechselt hat
    const remaining = Math.max(0, (overlayHoldUntilMsRef.current || 0) - now)
    if (remaining > 0) {
      const id = setTimeout(() => {
        overlayHoldUntilMsRef.current = 0
        setShowOverlay(false)
        overlayStateRef.current = 'idle'
        overlayDataRef.current = null
      }, remaining)
      return () => clearTimeout(id)
    }

    // Kein aktiver Hold – sicherstellen, dass Overlay aus ist, wenn keine Arm-Bedingungen vorliegen
    if (!(isShowdown && hasWinners)) {
          if (showOverlay) {
            setOverlayCooldown(true)
            setTimeout(()=> setOverlayCooldown(false), 260)
    setShowOverlay(false)
          }
    }
    return
  }, [handNumber, revealedCount, anyAllIn, myTable, showOverlay])

  // Deal countdown at start of a new hand (preflop, no community yet)
  useEffect(() => {
    const isNewHand = (street === 'preflop' && communityCards.length === 0)
    if (!isNewHand) return
    // start only when handNumber changes
    // After a fold mid‑match we want instant next hand; only show countdown for brand‑new match
    setDealCountdown(newMatchRef.current ? 3 : 0)
    // Reset Action‑State/Timers sofort beim neuen Deal
    try { prevActionSig.current = ''; prevActionRef.current = null; setActionState(null) } catch {}
    const id = setInterval(() => {
      setDealCountdown((v) => {
        if (v <= 1) { clearInterval(id); return 0 }
        return v - 1
      })
    }, 800)
    return () => clearInterval(id)
  }, [handNumber])

  const renderTables: TableState[] = useMemo(() => {
    if (tables.length > 0) return tables
    const h = (hand && hand[0]) as any
    const use = h || ((postHoldUntilMsRef.current > Date.now() && tableSnapshotRef.current) ? tableSnapshotRef.current : null)
    if (use && Array.isArray(use.players) && use.players.length) {
      return [{
        tableId: use.tableId ?? 'HU-Table',
        seats: use.players.map((p: any) => ({ playerId: p.playerId, seatIndex: p.seatIndex, chips: p.chips ?? 0 }))
      }]
    }
    return []
  }, [tables, hand])

  // Redirect to HU leaderboard after a match ends (table disappears) instead of empty table screen
  const hadTableRef = useRef<boolean>(false)
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (renderTables.length > 0) { hadTableRef.current = true; return }
    if (!hadTableRef.current || renderTables.length !== 0) return
    // Don't redirect while the match overlay is visible
    if (showOverlay || overlayStateRef.current === 'visible') return
    try { if (redirectTimerRef.current) { clearTimeout(redirectTimerRef.current) } } catch {}
    redirectTimerRef.current = setTimeout(() => {
      if (showOverlay || overlayStateRef.current === 'visible') return
      try { sessionStorage.setItem('pg_open_leader_once', '1'); window.location.hash = '#/hu' } catch {}
      hadTableRef.current = false
    }, 1200)
    return () => { try { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current) } catch {} }
  }, [renderTables.length, showOverlay])

  // helper to add floating text (percentage coords relative to felt center)
  function addFloat(text: string, xPct: number, yPct: number, size?: number) {
    const id = Math.random().toString(36).slice(2)
    const x = xPct
    const y = yPct
    setFloatTexts((arr)=> [...arr, { id, text, x, y, size }])
    // Mirror into local log so the "Show log" panel always has context
    try {
      const currentTableId = (hand && hand[0]?.tableId) || renderTables[0]?.tableId || null
      const line = { ts: Date.now(), text: `[FX] ${text}`, tableId: currentTableId }
      setChatLines((prev)=> [line as any, ...prev].slice(0,60))
    } catch {}
    setTimeout(()=> setFloatTexts((arr)=> arr.filter(f=> f.id !== id)), 2200)
  }

  const triggerHeroEmoji = (emoji: string, seatId?: string) => {
    addFloat(emoji, 32, 76, 28)
    // broadcast to other clients via WS
    try {
      const tId = renderTables[0]?.tableId || (hand && hand[0]?.tableId)
      ;(window as any).pg_ws_send && (window as any).pg_ws_send({ type:'emoji', tableId: tId, emoji })
    } catch {}
    if (seatId) {
      setSeatBloom((prev) => ({ ...prev, [seatId]: Date.now() }))
      setTimeout(() => setSeatBloom((prev) => {
        const copy = { ...prev }
        delete copy[seatId]
        return copy
      }), 600)
    }
  }

  const handleEmojiPressStart = (seatId?: string) => {
    setShowEmoji(true)
    const start = Date.now()
    setLongPress({ active: true, start })
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null }
    longPressTimer.current = window.setTimeout(() => {
      if (!longPress.active) return
      triggerHeroEmoji('🔥', seatId)
      setLongPress({ active: false, start: 0 })
    }, 650)
  }

  const handleEmojiPressEnd = (seatId?: string) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (longPress.active) {
      if (Date.now() - longPress.start < 650) {
        triggerHeroEmoji('👍', seatId)
      }
    }
    setLongPress({ active: false, start: 0 })
    setShowEmoji(false)
  }

  const handleEmojiPressCancel = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setLongPress({ active: false, start: 0 })
    setShowEmoji(false)
  }

  // Resolve display name (username) for a playerId (wallet). Falls back to wallet until loaded.
  function nameOf(pid?: string | null): string {
    if (!pid) return ''
    const cached = profileNameCache.current[pid]
    if (cached) return cached.name
    getProfile(pid).then((r:any)=>{
      try {
        const nm = (r && r.profile && r.profile.username) ? String(r.profile.username) : pid
        const av = (r && r.profile && r.profile.avatarUrl) ? String(r.profile.avatarUrl) : undefined
        profileNameCache.current = { ...profileNameCache.current, [pid]: { name: nm, avatar: av } }
        // persist a lightweight cache for summary route
        try {
          const raw = sessionStorage.getItem('pg_profile_cache')
          const obj = raw ? JSON.parse(raw) : {}
          obj[pid] = { name: nm, avatar: av }
          sessionStorage.setItem('pg_profile_cache', JSON.stringify(obj))
        } catch {}
        setProfileEpoch((v)=> v + 1)
      } catch {}
    }).catch(()=>{})
    return pid
  }

  useEffect(() => {
    const load = async () => {
      try {
        const st = (await handActionState())[0] ?? null
        const sig = st ? JSON.stringify({ a: st.actorSeatIndex, p: st.actorPlayerId, b: st.currentBet, r: st.minRaise, l: st.legalActions, d: st.actorDeadlineMs, c: st.committed }) : ''
        if (sig !== prevActionSig.current) { prevActionSig.current = sig; setActionState(st) }
      } catch {}
    }
    load()
    const id = setInterval(load, 1500)
    return () => clearInterval(id)
  }, [])

  const HoleCard = memo(({ c }: { c: any }) => (
    <span className={`card-sm suit-${c.suit}`} data-suit={c.suit}>{formatCardLabel(c)}</span>
  ))
  const HoleCardWrap = ({ front, revealed, glow }: { front: any, revealed: boolean, glow?: 'win'|'lose'|'tie'|null }) => (
    <span className={`card-wrap ${revealed? 'revealed':''} ${glow? `glow glow-${glow}`: ''}`}>
      <span className="face-back"><span className="card-back-sm" /></span>
      <span className="face-front"><HoleCard c={front} /></span>
    </span>
  )

  type SeatItemProps = {
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
  }
  const SeatItem = memo(({ seat, seatsLength, seatStyle, player, dealerIndex, actionState, wallet, remaining, bankMs, glowEpoch, tableState }: SeatItemProps) => {
    const isActor = !!actionState && actionState.actorSeatIndex === seat.seatIndex
    const isHero = !!wallet && seat.playerId === wallet
    const tablePlayer = useMemo(() => (tableState && Array.isArray(tableState.players)) ? tableState.players.find((p:any)=> p.playerId === seat.playerId) : null, [tableState, seat.playerId])
    const heroHole = isHero ? (tablePlayer?.hole ?? player?.hole ?? null) : null
    // reveal villain holecards nur bei Serverflag oder Showdown
    const showHole = isHero ? !!heroHole : (revealVillain ? !!(tablePlayer?.hole ?? player?.hole) : false)
    // blinds (HU): Dealer ist SB, der andere BB
    const isSB = dealerIndex != null && seatsLength === 2 && seat.seatIndex === dealerIndex
    const isBB = dealerIndex != null && seatsLength === 2 && seat.seatIndex !== dealerIndex
    // compute decision progress for actor seat
    let decPct = 0
    let bankMode = false
    let warnMode = false
    if (isActor && actionState) {
      const primaryRemaining = Math.max(0, (actionState.actorDeadlineMs as number) - nowMs)
      const PRIMARY_TOTAL = 20000 // UI default; server kann abweichen
      decPct = Math.max(0, Math.min(100, 100 - Math.floor((primaryRemaining / PRIMARY_TOTAL) * 100)))
      warnMode = primaryRemaining > 0 && primaryRemaining <= 3000
      if (primaryRemaining <= 0) {
        bankMode = true
        const bankRemaining = Math.max(0, (actionState.actorTimebankMs as number) || 0)
        const BANK_TOTAL = Math.max(1, bankRemaining)
        decPct = 100 - Math.floor((bankRemaining / BANK_TOTAL) * 100)
      }
    }
    let villainGlow: 'win'|'lose'|'tie'|null = null
    const allowGlow = !isHero && revealVillain
    if (allowGlow) {
      try {
        const st = tableState
        const community = (st?.community || []) as Array<{suit:string,rank:number}>
        const hero = (st && wallet) ? (st.players?.find((p:any)=> p.playerId===wallet) || null) : null
        const heroHole = hero && hero.hole ? hero.hole as Array<{suit:string,rank:number}> : null
        const villainHole = (tablePlayer?.hole ?? player?.hole) as Array<{suit:string,rank:number}> | undefined
        // nur mit aktuell sichtbaren Community-Karten vergleichen (revealedCount)
        const visibleComm = community.slice(0, Math.max(0, revealedCount))
        if (heroHole && villainHole && heroHole.length===2 && villainHole.length===2) {
          const heroEval = evalClient([ ...heroHole, ...visibleComm ] as any)
          const villEval = evalClient([ ...villainHole, ...visibleComm ] as any)
          const diff = cmpClient(heroEval, villEval)
          // Mapping:
          // diff > 0 → Hero ahead → Villain behind → green (glow-win)
          // diff < 0 → Villain ahead → red (glow-lose)
          // diff = 0 → tie → yellow (glow-tie)
          if (diff > 0) villainGlow = 'win'
          else if (diff < 0) villainGlow = 'lose'
          else villainGlow = 'tie'
        }
      } catch {}
    }
    const bloomActive = !!seatBloom[seat.playerId]
    return (
      <div className={`seat ${isActor?'actor actor-pulse':''} ${bloomActive ? 'seat-bloom' : ''}`} style={seatStyle}>
        {player?.allIn && (<div className="allin-badge" title="Player is all-in">ALL‑IN</div>)}
        {street === 'preflop' && isSB && (<div className="blind-badge sb" title="Small Blind">SB</div>)}
        {street === 'preflop' && isBB && (<div className="blind-badge bb" title="Big Blind">BB</div>)}
          <div className={`row ${bloomActive ? 'row-bloom' : ''}`}>
          <div className="avatar-wrap">
            <svg className={`ring ${bankMode? 'bank':''} ${warnMode? 'warn':''}`} viewBox="0 0 44 44">
              <circle className="bg" cx="22" cy="22" r="20" />
              <circle className="fg" cx="22" cy="22" r="20" style={{ strokeDasharray: 2*Math.PI*20, strokeDashoffset: ((100-decPct)/100)*(2*Math.PI*20) }} />
            </svg>
            {(() => {
              const pid = seat.playerId
              const cached = profileNameCache.current[pid]
              const avatar = cached?.avatar
              if (avatar) {
                return <img src={avatar} alt="avatar" className="avatar" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover' }} />
              }
              const dispName = cached?.name ?? pid
              const letters = (dispName || '').toString().trim().replace(/[^A-Za-z]/g, '').slice(0,2).toUpperCase()
              return <div className="avatar">{letters || (dispName || pid).toString().slice(0,2).toUpperCase()}</div>
            })()}
            
          </div>
          <div>
            <div style={{ fontWeight:700 }} data-prof-epoch={profileEpoch}>{(() => {
              const pid = seat.playerId
              const cached = profileNameCache.current[pid]
              if (cached) return cached.name
              // async fetch username, fallback to wallet
              getProfile(pid).then((r:any)=>{
                const name = (r && r.profile && r.profile.username) ? String(r.profile.username) : pid
                const av = (r && r.profile && r.profile.avatarUrl) ? String(r.profile.avatarUrl) : undefined
                profileNameCache.current = { ...profileNameCache.current, [pid]: { name, avatar: av } }
                setProfileEpoch((v)=> v + 1)
              }).catch(()=>{})
              return pid
            })()}</div>
            <div className={`chip-pill ${bloomActive ? 'chip-bloom' : ''}`}>{(() => {
              const pid = seat.playerId
              const serverStack = player?.chips ?? seat.chips ?? 0
              const committedNow = Number(actionState?.committed?.[pid] ?? committedRef.current?.[pid] ?? (hand && (hand[0]?.showdownCommitted?.[pid] ?? hand[0]?.committed?.[pid])) ?? 0)
              const isAllInFlow = inRevealUIRef.current || anyAllIn || (hand && hand[0]?.allInLocked && hand[0]?.bettingClosed) || street === 'showdown'
              const useFrozen = isAllInFlow && Number.isFinite(displayChipsRef.current?.[pid])
              const frozen = useFrozen ? Number(displayChipsRef.current?.[pid]) : null
              const display = useFrozen ? frozen! : (isAllInFlow ? Math.max(0, serverStack - committedNow) : serverStack)
              return `${display} chips`
            })()}</div>
          </div>
        </div>
        <div className={`decbar ${bankMode? 'bank':''}`}> <div className="fill" style={{ width: `${decPct}%` }} /> </div>
        {isActor && (
          <div className="time-pill">
            {remaining && remaining > 0 ? `${remaining}s` : bankMs>0 ? `TB ${Math.ceil(bankMs/1000)}s` : '0s'}
          </div>
        )}
        {/* Kleine visuelle Chipstapel pro Spieler */}
        <div className="seat-chips" aria-hidden>
          {(() => {
            const pid = seat.playerId
            const serverStack = player?.chips ?? seat.chips ?? 0
            const committedNow = Number(actionState?.committed?.[pid] ?? committedRef.current?.[pid] ?? (hand && (hand[0]?.showdownCommitted?.[pid] ?? hand[0]?.committed?.[pid])) ?? 0)
            const isAllInFlow = inRevealUIRef.current || anyAllIn || (hand && hand[0]?.allInLocked && hand[0]?.bettingClosed) || street === 'showdown'
            const useFrozen = isAllInFlow && Number.isFinite(displayChipsRef.current?.[pid])
            const stackValue = useFrozen ? Number(displayChipsRef.current?.[pid]) : (isAllInFlow ? Math.max(0, serverStack - committedNow) : serverStack)
            const c = Math.min(6, stackValue > 2000 ? 6 : stackValue > 1000 ? 5 : stackValue > 500 ? 4 : 3)
            const cx = 32, cy = 18
            return Array.from({ length: c }).map((_, i) => {
              const angle = (i / c) * (Math.PI * 2)
              const r = 8 + (i % 2)
              const x = cx + Math.cos(angle) * r
              const y = cy + Math.sin(angle) * r
              const color = i % 3 === 0 ? 'blue' : (i % 3 === 1 ? 'green' : '')
              return <span key={i} className={`seat-chip ${color}`} style={{ left: x, top: y }} />
            })
          })()}
        </div>
        {isHero ? (
          <div className="hole-wrap deal-in" style={{ marginTop:6, display:'flex', justifyContent:'center', gap:6 }}>
            {heroHole ? (
              heroHole.map((c:any, i:number)=> (
                <span key={i}><HoleCardWrap front={c} revealed={true} /></span>
              ))
            ) : (
              <>
                <span className="card-back-sm" />
                <span className="card-back-sm" />
              </>
            )}
          </div>
        ) : (
          <div className="hole-wrap deal-in villain" style={{ marginTop:6, display:'flex', justifyContent:'center', gap:6 }}>
            {(tablePlayer?.hole ?? player?.hole) ? (
              showHole
                ? (tablePlayer?.hole ?? player?.hole).map((c:any, i:number)=> (
                    <span key={`${seat.seatIndex}-${i}-${glowEpoch}`}>
                      <HoleCardWrap front={c} revealed={true} glow={villainGlow} />
                    </span>
                  ))
                : (<>
                    <span className="card-back-sm" />
                    <span className="card-back-sm" />
                  </>)
            ) : (
              <>
                <span className="card-back-sm" />
                <span className="card-back-sm" />
              </>
            )}
          </div>
        )}
        {dealerIndex === seat.seatIndex && (
          <div className="dealer">D</div>
        )}
      </div>
    )
  }, (prev, next) => {
    // custom comparator to avoid unnecessary re-renders
    const shallowEq = (a:any,b:any) => a===b
    const prevIsActor = !!prev.actionState && prev.actionState.actorSeatIndex === prev.seat.seatIndex
    const nextIsActor = !!next.actionState && next.actionState.actorSeatIndex === next.seat.seatIndex
    return (
      prev.seat.playerId === next.seat.playerId &&
      prev.seat.seatIndex === next.seat.seatIndex &&
      JSON.stringify(prev.seatStyle) === JSON.stringify(next.seatStyle) &&
      prev.seat.chips === next.seat.chips &&
      prev.seatsLength === next.seatsLength &&
      shallowEq(prev.dealerIndex, next.dealerIndex) &&
      (
        (prevIsActor || nextIsActor)
          ? (
            (prev.actionState?.actorSeatIndex === next.actionState?.actorSeatIndex) &&
            (prev.actionState?.actorDeadlineMs === next.actionState?.actorDeadlineMs) &&
            (prev.actionState?.currentBet === next.actionState?.currentBet) &&
            (prev.actionState?.minRaise === next.actionState?.minRaise) &&
            (prev.bankMs === next.bankMs) &&
            (prev.remaining === next.remaining)
          )
          : true
      ) &&
      (prev.wallet === next.wallet) &&
      (prev.glowEpoch === next.glowEpoch) &&
      // compare hole presence for own wallet only
      (!!prev.player?.hole === !!next.player?.hole)
    )
  })

  return (
      <div className={`${overlayCooldown ? 'overlay-cooldown' : ''} pg-game-in`} style={{ maxWidth: 1100, margin: '1.4rem auto' }} onContextMenu={(e)=>{
      const el = e.target as HTMLElement
      if (el && (el.closest('.emoji-btn') || el.closest('.emoji-panel') || el.closest('.allow-context'))) return
      e.preventDefault()
    }}>
      <h2>Table</h2>
      {level && (
        <p><b>Level {level.index + 1}:</b> {level.smallBlind}/{level.bigBlind} · {level.durationSec}s</p>
      )}
      <div style={{ width:'100%', display: 'flex', justifyContent:'center', marginBottom: 12 }}>
        <div className="stage-bar">
          <div className="stage-chip">
            <span>Street:</span>
            <strong>{street ?? '-'}</strong>
          </div>
          <div className="stage-chip">
            <span>Pot:</span>
            <strong>{pot}</strong>
          </div>
          <div className="stage-chip">
            <span>Community:</span>
            <strong>{communityCards.slice(0, Math.max(0, revealedCount)).map((c:any) => formatCardLabel(c)).join(' ') || '-'}</strong>
          </div>
        </div>
      </div>
      {renderTables.length === 0 && <p>No seating yet.</p>}
      {renderTables.map((t) => (
        <div key={t.tableId} className="table-card" style={{ border: '1px solid #ddd', padding: 12, marginBottom: 12 }}>
          <h3>{t.tableId}</h3>
          <div className="felt-wrap">
            <div className={`felt ${riverPulse ? 'river-pulse' : ''} ${anyAllIn ? 'allin-mode' : ''}`} ref={feltRef}>
              {/* deal-in animation layer */}
              {dealFx.length>0 && (
                <div className="deal-fly" aria-hidden>
                  {dealFx.map((f)=> (
                    <span key={f.id} className="card-sm" style={{ animationDelay: '0ms', ['--to-transform' as any]: `translate(${f.x}px, ${f.y}px)`, ['--to-rot' as any]: `${f.rot}deg` }} />
                  ))}
                </div>
              )}
              {/* Community + HUD center */}
              <div className="hud" style={{ pointerEvents:'none', width:'100%', height:'100%' }}>
                <div className="center-stack">
                  <div className={`pot ${actionState && (actionState.legalActions?.includes('raise')||actionState.legalActions?.includes('bet'))? 'pot-pulse':''} ${riverPulse ? 'pot-river-pulse':''}`} data-pulse={riverPulse}>Pot {pot}</div>
              <div className="community">
                {communityCards.slice(0, revealedCount).map((c:any, i:number)=> (
                  <span key={`${handNumber}-${i}-${c.suit}-${c.rank}`} className={`card-md suit-${c.suit} ${i >= prevCommLenRef.current ? 'deal-slide' : ''}`} data-suit={c.suit} style={{ animationDelay: `${i*120}ms` }}>{formatCardLabel(c)}</span>
                ))}
              </div>
                </div>
                {dealCountdown > 0 && (
                  <div style={{ fontSize:26, fontWeight:800, marginBottom:6, height:32, pointerEvents:'auto' }}>{dealCountdown}</div>
                )}
                {allInBanner && (
                  <div className="allin-banner" style={{ pointerEvents:'auto' }}>All‑In in progress…</div>
                )}
                {/* Floating commentary */}
                {floatTexts.map((f)=> (
                  <div key={f.id} className="float-text" style={{ left:`${f.x}%`, top:`${f.y}%`, fontSize: f.size ?? 18 }}>
                    {f.text}
                  </div>
                ))}
                <div className="layer stage-anim" data-animkey={stageAnimKey}>
              {/* Chip stack based on pot (top-down pile with seeded scatter, denom colors) */}
              {(() => {
                const bb = (level?.bigBlind ?? 100) as number
                const denoms = [bb*1, bb*0.25, Math.max(1, Math.round(bb*0.05))]
                const colors = ['blue','green','red'] as const
                let remaining = pot
                const maxChips = 12
                const valueChips: {color:string}[] = []
                for (let d=0; d<denoms.length && valueChips.length < maxChips; d++) {
                  const denom = denoms[d]
                  let cnt = Math.min(6, Math.floor(remaining / denom))
                  while (cnt > 0 && valueChips.length < maxChips) { valueChips.push({ color: colors[d] }); remaining -= denom; cnt-- }
                }
                // If still empty (very small pot), add 2 small chips
                if (valueChips.length === 0) { valueChips.push({color:'red'}); if (pot>0) valueChips.push({color:'green'}) }
                const cx = 60, cy = 45
                const base = seededRand(handNumber||1, 7) * Math.PI * 2
                const chips = valueChips.map((ch, i) => {
                  const ring = Math.floor(i / 6)
                  const pos = i % 6
                  const jitterA = (seededRand((handNumber||1)+(i+1), 13) - 0.5) * 0.5 // +-0.25 rad
                  const angle = base + (pos / 6) * (Math.PI * 2) + (ring * 0.25) + jitterA
                  const jitterR = (seededRand((handNumber||1)+(i+1), 29) - 0.5) * 2.0 // +-1px
                  const radius = 10 + ring * 8 + jitterR
                  const x = cx + Math.cos(angle) * radius
                  const y = cy + Math.sin(angle) * radius
                  return <div key={i} className={`chip ${ch.color}`} style={{ left: x, top: y }} />
                })
                  const nudge = () => {
                    try {
                      const wrap = document.querySelector('.chip-stack') as HTMLElement | null
                      if (!wrap) return
                      // spread: leicht auseinanderfächern durch temporäres scale & rotate jitter
                      const prev = wrap.style.transform || 'translate(-50%, -50%)'
                      const rot = (Math.random()*6 - 3) // -3..+3 deg
                      wrap.style.transform = `${prev} rotate(${rot}deg) scale(1.06)`
                      // zusätzlich: einzelne chips leicht versetzen
                      try {
                        const items = Array.from(wrap.querySelectorAll('.chip')) as HTMLElement[]
                        items.forEach((el, idx) => {
                          const dx = ((idx%3)-1) * 2 + (Math.random()*2-1)
                          const dy = (Math.floor(idx/3)-1) * 1.5 + (Math.random()*2-1)
                          el.style.transition = 'transform 160ms ease-out'
                          el.style.transform = `translate(${dx}px, ${dy}px)`
                        })
                        setTimeout(()=> {
                          items.forEach((el)=> { el.style.transform = ''; el.style.transition=''; })
                        }, 200)
                      } catch {}
                      setTimeout(()=> { wrap.style.transform = prev }, 220)
                    } catch {}
                    try { resumeAudio(); playChip() } catch {}
                  }
                  const makeTransparent = (e: React.MouseEvent) => {
                    e.preventDefault()
                    try {
                      const wrap = document.querySelector('.chip-stack') as HTMLElement | null
                      if (!wrap) return
                      wrap.classList.add('transparent')
                      setTimeout(()=> wrap.classList.remove('transparent'), 1200)
                    } catch {}
                  }
                  const shouldFly = potFlightHandRef.current === handNumber && Array.isArray(myTable?.lastWinners) && myTable!.lastWinners.length
                  const firstWinner = shouldFly ? myTable!.lastWinners[0] : null
                  const stackId = firstWinner?.playerId
                  return <div className={`chip-stack ${pot>0?'chip-pulse':''} ${shouldFly && stackId ? 'chip-flight-trigger' : ''}`} data-winner={stackId ?? ''} onClick={nudge} onContextMenu={makeTransparent} title="Nudge chips" aria-hidden>{chips}</div>
              })()}
              </div>
            </div>
              {/* Emoji quick action placed outside the table (left aligned) */}
              <div style={{ display:'flex', justifyContent:'flex-start', padding:'4px 8px', width:'100%', position:'relative' }} onContextMenu={(e)=>{
                const el = e.target as HTMLElement
                if (el && (el.closest('.emoji-btn') || el.closest('.emoji-panel'))) { e.preventDefault(); return }
              }}>
                <button
                  className={`emoji-btn ${longPress.active ? 'emoji-pressing' : ''}`}
                  title="Send emoji"
                  onMouseDown={(e)=>{ if (e.button===2){ e.preventDefault(); setShowEmoji(true); return } handleEmojiPressStart(renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId) }}
                  onMouseUp={(e)=>{ if (e.button===2){ e.preventDefault(); setShowEmoji(true); return } handleEmojiPressEnd(renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId) }}
                  onMouseLeave={() => { if (!showEmoji) handleEmojiPressCancel() }}
                  onTouchStart={()=> handleEmojiPressStart(renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId)}
                  onTouchEnd={()=> handleEmojiPressEnd(renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId)}
                  onTouchCancel={handleEmojiPressCancel}
                >🙂</button>
                {showEmoji && (
                  <div className="emoji-panel" style={{ animation:'fadeIn 120ms ease-out', bottom: 24 }} onMouseLeave={()=> setShowEmoji(false)}>
                    <button onClick={()=>{ triggerHeroEmoji('👍', renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId); setShowEmoji(false) }}>👍</button>
                    <button onClick={()=>{ triggerHeroEmoji('🔥', renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId); setShowEmoji(false) }}>🔥</button>
                    <button onClick={()=>{ triggerHeroEmoji('😎', renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId); setShowEmoji(false) }}>😎</button>
                    <button onClick={()=>{ triggerHeroEmoji('😡', renderTables[0]?.seats?.find((s:any)=> s.playerId===wallet)?.playerId); setShowEmoji(false) }}>😡</button>
                  </div>
                )}
              </div>
              {/* Seats positioned absolute within felt-wrap (outside center) */}
              <div className="seat-layer">
            {t.seats.map((s) => {
            const p = hand && hand[0]?.players?.find((pp:any)=>pp.seatIndex===s.seatIndex)
            const isActor = !!actionState && actionState.actorSeatIndex === s.seatIndex
            const dl = isActor ? (actionState?.actorDeadlineMs as number) : null
            const remaining = dl ? Math.max(0, Math.ceil((dl - nowMs)/1000)) : null
            const bankMs = isActor ? (actionState?.actorTimebankMs as number) ?? 0 : 0
                const totalSeats = t.seats.length
                const heroSeatIdx = wallet ? t.seats.findIndex((seat) => seat.playerId === wallet) : -1
                const heroBottom: CSSProperties = { left: '50%', bottom: '-96px', transform: 'translate(-50%, 0)' }
                const villainTop: CSSProperties = { left: '50%', top: '-96px', transform: 'translate(-50%, 0)' }
                let seatStyle: CSSProperties
                if (totalSeats <= 2) {
                  const heroBelow = heroSeatIdx === -1 || heroSeatIdx === 0
                  if (heroBelow) {
                    seatStyle = (heroSeatIdx === -1 || s.seatIndex === heroSeatIdx) ? heroBottom : villainTop
                  } else {
                    seatStyle = s.seatIndex === heroSeatIdx ? heroBottom : villainTop
                  }
                } else {
                  const ringPositions: CSSProperties[] = [
                    heroBottom,
                    { left: '78%', top: '42%', transform: 'translate(-50%, -50%)' },
                    { left: '22%', top: '42%', transform: 'translate(-50%, -50%)' },
                    villainTop,
                    { left: '86%', top: '-6%', transform: 'translate(-50%, 0)' },
                    { left: '14%', top: '-6%', transform: 'translate(-50%, 0)' },
                  ]
                  const normalized = heroSeatIdx >= 0 ? (s.seatIndex - heroSeatIdx + totalSeats) % totalSeats : s.seatIndex
                  seatStyle = ringPositions[Math.min(normalized, ringPositions.length - 1)]
                }
            return (
              <SeatItem key={s.seatIndex}
                seat={s}
                seatsLength={t.seats.length}
                    seatStyle={seatStyle}
                player={p || null}
                dealerIndex={dealerIndex}
                actionState={actionState}
                wallet={wallet}
                remaining={remaining}
                bankMs={bankMs}
                    glowEpoch={revealedCount}
                    tableState={myTable}
              />
            )
            })}
              </div>
          </div>
          {/* Chat UI anchored to felt-wrap (bottom-right of wrapper) */}
            <button className="chat-toggle" style={{ right: 16, left: 'auto', bottom: 6 }} onClick={()=> setChatOpen(!chatOpen)}>{chatOpen? 'Hide log':'Show log'}</button>
          {toast && <div className="toast">{toast}</div>}
          {chatOpen && (()=>{
            const currentTableId = (hand && hand[0]?.tableId) || t.tableId;
            const filtered = chatLines.filter((l)=> l.tableId == null || l.tableId === currentTableId);
            const lines = filtered.length > 0 ? filtered : chatLines;
            return (
              <div className="chat-panel">
                {lines.map((l)=> (
                  <div key={`${l.ts}-${l.tableId ?? 'all'}`} className="line">{new Date(l.ts).toLocaleTimeString()} · {(l.tableId ? `[${l.tableId}] ` : '')}{l.text}</div>
                ))}
              </div>
            )
          })()}
          </div>
        {actionState && (()=>{
          const actor = actionState.actorPlayerId;
          const committed = actionState.committed?.[actor] ?? 0;
          const toCall = Math.max(0, actionState.currentBet - committed);
          const canBet = actionState.legalActions.includes('bet');
          const isBet = canBet && toCall === 0;
          const minToRaw = isBet ? Math.max(actionState.minRaise, actionState.currentBet || actionState.minRaise) : actionState.currentBet + actionState.minRaise;
          const maxTo = (actionState.committed?.[actor] ?? 0) + (renderTables[0]?.seats.find(s=>s.playerId===actor)?.chips ?? 0);
          const minTo = Math.min(minToRaw, maxTo); // clamp to all-in when short
          const potVal = (hand && hand[0]?.pot) || 0;
          const canAct = !!wallet && wallet === actor;
          const me = (hand && wallet) ? (hand[0]?.players?.find((p:any)=> p.playerId===wallet) || null) : null
          const imAllIn = !!me && !!me.allIn
          // Robustere Erkennung für Zwischenframe (Push→Call): auch dann Dots zeigen,
          // wenn noch niemand als allIn markiert ist, aber committed >= chips für jemanden gilt
          const pendingAllIn = (() => {
            try {
              const st = hand && hand[0]
              if (!st) return anyAllIn
              const comm = (actionState?.committed || st.committed || {}) as Record<string, number>
              const players = (st.players || []) as any[]
              return anyAllIn || players.some((p:any)=> (comm[p.playerId] ?? 0) >= (p.chips ?? 0))
            } catch { return anyAllIn }
          })()
          // const imInHand = !!me && !!me.inHand && !me.busted
          const primaryLabel = () => {
            if (pendingBtnLabel) return pendingBtnLabel
            if (sizingAmt && sizingAmt > 0) return isBet ? `Bet ${sizingAmt}` : `Raise to ${sizingAmt}`
            if (isBet) {
              const bb = (level?.bigBlind ?? actionState.minRaise) as number
              const def = Math.min(maxTo, Math.max(minTo, bb * 2))
              return `Bet ${def}`
            }
            return `Raise to ${minTo}`
          }
          return (
              <div className="action-panel actor-anim" data-animkey={actorAnimKey} style={{ marginTop: 84, marginBottom: 24 }}>
              {imAllIn ? (
            <>
              <div className="action-info info" style={{ justifyContent:'center' }}><span className="spinner" />You're All‑In! Waiting for opponent…</div>
              <div className="allin-fill" aria-hidden>
                <span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </>
              ) : (
              <div className="action-info" style={{ background:'rgba(255,255,255,0.96)', color:'#0a2a1b', marginLeft: -8 }}>
                <span><b>To act:</b> {nameOf(actor)}</span>
                  <span><b>To call:</b> {toCall}</span>
                  {!isBet && <span><b>Min raise:</b> {actionState.currentBet + actionState.minRaise}</span>}
                </div>
              )}
              {canAct ? (
              <div className="action-row">
                {!imAllIn && actionState.legalActions.includes('fold') && (
                  <button className="btn btn-danger" disabled={!canAct} onClick={async ()=>{ try { await handAction({ tableId: renderTables[0].tableId, playerId: actor, type:'fold' }); setSizingAmt(null) } catch(e:any){ alert(e?.message||'Action error') } }}>Fold</button>
                )}
                {!imAllIn && actionState.legalActions.includes('call') && (
                  <button className="btn btn-primary" disabled={!canAct} onClick={async ()=>{ try { await handAction({ tableId: renderTables[0].tableId, playerId: actor, type:'call' }); setSizingAmt(null) } catch(e:any){ alert(e?.message||'Action error') } }}>{toCall>0? `Call ${toCall}`:'Call'}</button>
                )}
                {!imAllIn && actionState.legalActions.includes('check') && (
                    <button className="btn btn-check" disabled={!canAct} onClick={async ()=>{ try { await handAction({ tableId: renderTables[0].tableId, playerId: actor, type:'check' }); setSizingAmt(null); playSound('check', () => { resumeAudio(); playCheck() }) } catch(e:any){ alert(e?.message||'Action error') } }}>Check</button>
                )}
                {!imAllIn && (isBet || actionState.legalActions.includes('raise')) && (
                  <form className="sizing" onSubmit={async (e)=>{
                    e.preventDefault();
                    if (!canAct) return;
                    const input = (e.currentTarget.elements.namedItem('amt') as HTMLInputElement);
                    let v = Number(input.value||0);
                    if (v < minTo) v = minTo;
                    try {
                      const label = isBet ? `Bet ${v}` : `Raise to ${v}`
                      setPendingBtnLabel(label)
                      await handAction({ tableId: renderTables[0].tableId, playerId: actor, type: isBet?'bet':'raise', amount: v });
                      input.value='';
                      setSizingAmt(null)
                    } catch(err:any){ alert(err?.message||'Action error'); setPendingBtnLabel(null) }
                  }}>
                      <div className="sizing-controls" style={{ background:'#fff' }}>
                      <input name="amt" type="number" min={minTo} max={maxTo} placeholder={String(minTo)} disabled={!canAct}
                        onChange={(e)=>{ const v = Number(e.currentTarget.value||0); setSizingAmt(Number.isFinite(v)?v:null); }} />
                      <input name="slider" type="range" min={minTo} max={maxTo} defaultValue={minTo} disabled={!canAct}
                        onChange={(e)=>{ const f = (e.currentTarget.form!.elements.namedItem('amt') as HTMLInputElement); f.value = e.currentTarget.value; setSizingAmt(Number(e.currentTarget.value||0)); }} />
                      <div className="presets">
                        {isBet ? (
                          <>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=Math.max(minTo, Math.round(potVal*0.5)); f.value=String(v); setSizingAmt(v) }}>1/2</button>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=Math.max(minTo, Math.round(potVal*0.66)); f.value=String(v); setSizingAmt(v) }}>2/3</button>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=Math.min(maxTo, Math.max(minTo, potVal)); f.value=String(v); setSizingAmt(v) }}>Pot</button>
                            <button type="button" disabled={!canAct} data-testid="allin-preset" onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); f.value = String(maxTo); setSizingAmt(maxTo) }}>All-in</button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=minTo; f.value=String(v); setSizingAmt(v) }}>Min</button>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=Math.max(minTo, actionState.currentBet * 2); f.value=String(v); setSizingAmt(v) }}>2x</button>
                            <button type="button" disabled={!canAct} onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); const v=Math.max(minTo, Math.round(actionState.currentBet * 2.5)); f.value=String(v); setSizingAmt(v) }}>2.5x</button>
                            <button type="button" disabled={!canAct} data-testid="allin-preset" onClick={(e)=>{ const form = (e.currentTarget.closest('form') as HTMLFormElement); const f = (form.elements.namedItem('amt') as HTMLInputElement); f.value = String(maxTo); setSizingAmt(maxTo) }}>All-in</button>
                          </>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-success" type="submit" disabled={!canAct} data-testid={isBet? 'submit-bet':'submit-raise'}>{primaryLabel()}</button>
                  </form>
                )}
              </div>
              ) : (
                  imAllIn ? null : (
                    <div className="waiting-block" style={{ width:'100%' }}>
                      <div className="action-info info" style={{ justifyContent:'center', marginBottom:10 }}><span className="spinner" />Waiting for opponent…</div>
                      {pendingAllIn ? (
                        <div className="allin-fill" aria-hidden>
                          <span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" />
                        </div>
                      ) : (
                        <div className="waiting-row" style={{ height:72 }} />
                      )}
                    </div>
                  )
              )}
              {!imAllIn && pendingAllIn && (
                <div className="allin-fill" aria-hidden>
                  <span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              )}
            </div>
          );
        })()}
        
        {!actionState && (
          <div className="action-panel actor-anim" data-animkey={actorAnimKey} style={{ marginTop: 84, marginBottom: 24 }}>
            <div className="action-info info" style={{ justifyContent:'center' }}><span className="spinner" />{inRevealUI ? 'All‑In in progress…' : 'Waiting…'}</div>
            <div className="allin-fill" aria-hidden>
              <span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}
        </div>
      ))}
        {showOverlay && (
          (()=>{
            const snap = overlayDataRef.current
            const winners = snap?.winners || []
            const youWin = !!(wallet && winners.some((w:any) => w.playerId === wallet))
            const isSplit = Array.isArray(winners) && winners.length > 1
            const isMatchEnd = !!(snap ? (snap as any).matchEnd : false)
            return (
              <div
                className={`overlay ${isMatchEnd? 'match':''}`}
                data-testid="overlay"
                style={{
                  position:'fixed', left:0, right:0, top:0, bottom:0, zIndex: 9999,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  backgroundImage: `linear-gradient(rgba(10,2,22,0.85), rgba(10,2,22,0.92)), url(${pgLogo})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  backgroundSize: '520px auto'
                }}
              >
                <div className="overlay-content">
                  <div style={{ fontWeight:800, marginBottom:8, fontSize: isMatchEnd? 22: 18 }}>
                    {isMatchEnd
                      ? (youWin ? 'Match Over – You Win!' : 'Match Over – You Lose')
                      : (isSplit ? 'Split Pot' : (youWin ? 'You Win!' : 'You Lose'))}
                  </div>
                  <div style={{ marginBottom:8 }}>
                    Winners: {Array.isArray(winners) ? winners.map((w:any)=> `${nameOf(w.playerId)} (+${w.amount})`).join(', ') : ''}
                  </div>
                  {(snap && (snap as any).showdownInfo) && (
                    <div style={{ fontSize:12, opacity:0.9 }}>
                      {((snap as any).showdownInfo)?.map((s:any)=> `${nameOf(s.playerId)}: ${s.category}`).join(' · ')}
                    </div>
                  )}
                  {isMatchEnd && (
                    <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
                      <button className="btn" onClick={()=>{
                        try { (window as any).location.assign('/'); } catch {}
                      }}>Quit</button>
                      <button className="btn btn-success" onClick={()=>{
                        // user explicitly opts into next match: enqueue vs bot
                        try {
                          fetch(`${import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080'}/hu/bot/join/${encodeURIComponent(wallet||'')}`, { method:'POST' }).catch(()=>{})
                        } catch {}
        setOverlayCooldown(true)
        setTimeout(()=> setOverlayCooldown(false), 260)
        setShowOverlay(false);
                        overlayStateRef.current='idle';
                        overlayHoldUntilMsRef.current=0;
                        try { sessionStorage.setItem('pg_open_leader_once', '1') } catch {}
                      }}>Next Match</button>
                      <button className="btn btn-primary" onClick={()=>{
                        // open leaderboard in a new tab
                        try { sessionStorage.setItem('pg_open_leader_once', '1'); window.location.hash = '#/hu' } catch {}
                      }}>Check Leaderboard</button>
                    </div>
                  )}
                  <button aria-label="Close" title="Close" onClick={()=>{ setShowOverlay(false); overlayStateRef.current='idle'; overlayHoldUntilMsRef.current=0; }}
                    style={{ position:'absolute', right:8, top:8, border:'1px solid #ddd', background:'#fff', borderRadius:8, padding:'2px 6px' }}>×</button>
                </div>
              </div>
            )
          })()
        )}
    </div>
  )
}


