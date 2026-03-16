export const BACKEND = import.meta.env.VITE_BACKEND_URL
  ?? (window.location.hostname === 'localhost' ? 'http://localhost:8080' : '');

export async function getLobby() {
  const res = await fetch(`${BACKEND}/lobby`);
  if (!res.ok) throw new Error("failed to fetch lobby");
  return res.json();
}

export async function register(wallet: string) {
  const res = await fetch(`${BACKEND}/register/${wallet}`, { method: "POST" });
  if (!res.ok) throw new Error("failed to register");
  return res.json();
}

export function connectWS(
  onMessage: (msg: unknown) => void,
  onStatus?: (status: 'open'|'retrying'|'closed', retries: number) => void
) {
  const wsUrl = BACKEND
    ? BACKEND.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  let ws: WebSocket | null = null;
  let retries = 0;
  const waitForHealth = async (): Promise<boolean> => {
    try {
      const c = await fetch(`${BACKEND}/health`, { cache: 'no-store' })
      return c.ok
    } catch { return false }
  }
  const connect = () => {
    try { onStatus && onStatus('retrying', retries); } catch {}
    const openWS = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        retries = 0
        try { onStatus && onStatus('open', 0); } catch {}
        try {
          const w = sessionStorage.getItem('pg_wallet')
          if (w && ws) ws.send(JSON.stringify({ type:'identify', wallet: w }))
        } catch {}
      };
      try { (window as any).pg_ws_send = (payload: any) => { try { ws && ws.readyState === ws.OPEN && ws.send(JSON.stringify(payload)) } catch {} } } catch {}
      try {
        (window as any).pg_ws_identify = () => {
          try {
            const w = sessionStorage.getItem('pg_wallet')
            if (w && ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type:'identify', wallet: w }))
          } catch {}
        }
      } catch {}
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string)
          if (!data || typeof data.type !== 'string') return
          onMessage(data)
        } catch {}
      };
      ws.onclose = () => {
        if (retries < 5) {
          const timeout = 500 * Math.pow(2, retries++);
          try { onStatus && onStatus('retrying', retries); } catch {}
          setTimeout(connect, timeout);
        } else {
          try { onStatus && onStatus('closed', retries); } catch {}
        }
      };
      ws.onerror = () => { try { ws && ws.close(); } catch {} };
    }
    waitForHealth().then((ok) => {
      if (ok) openWS(); else {
        const timeout = 500 * Math.pow(2, retries++);
        setTimeout(connect, timeout);
      }
    })
  };
  connect();
  return { close: () => { try { ws && ws.close(); } catch {} } } as unknown as WebSocket;
}

export async function getSeating() {
  const res = await fetch(`${BACKEND}/seating`)
  if (!res.ok) throw new Error('failed to fetch seating')
  return res.json()
}

export async function getLevel() {
  const res = await fetch(`${BACKEND}/level`)
  if (!res.ok) throw new Error('failed to fetch level')
  return res.json()
}

export async function handStart() {
  const res = await fetch(`${BACKEND}/hand/start`, { method: 'POST' })
  if (!res.ok) throw new Error('failed to start hand')
  return res.json()
}

export async function handAdvance() {
  const res = await fetch(`${BACKEND}/hand/advance`, { method: 'POST' })
  if (!res.ok) throw new Error('failed to advance hand')
  return res.json()
}

export async function handState() {
  const res = await fetch(`${BACKEND}/hand/state`)
  if (!res.ok) throw new Error('failed to get hand state')
  return res.json()
}

export function authHeaders(token: string) {
  return { 'Authorization': `Bearer ${token}` } as Record<string, string>
}

export async function listTables(token?: string) {
  const res = await fetch(`${BACKEND}/seating${token ? '?admin=1' : ''}`, token ? { headers: authHeaders(token) } : undefined)
  if (!res.ok) throw new Error('failed to fetch seating')
  return res.json()
}

export async function handActionState() {
  const res = await fetch(`${BACKEND}/hand/action_state`)
  if (!res.ok) throw new Error('failed to get action state')
  return res.json()
}

export async function handAction(payload: { tableId: string, playerId: string, type: 'fold'|'check'|'call'|'bet'|'raise', amount?: number }) {
  const res = await fetch(`${BACKEND}/hand/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error((await res.json()).error ?? 'failed to send action')
  return res.json()
}

// History & Fairness
export async function handHistory(tableId?: string) {
  const url = tableId ? `${BACKEND}/hand/history?tableId=${encodeURIComponent(tableId)}` : `${BACKEND}/hand/history`
  const res = await fetch(url)
  if (!res.ok) throw new Error('failed to get hand history')
  return res.json()
}
// Client diagnostics
export async function diagLog(tag: string, data?: any) {
  try {
    const res = await fetch(`${BACKEND}/diag/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag, data }) })
    return res.ok
  } catch { return false }
}


export async function fairnessCommit(tableId: string) {
  const res = await fetch(`${BACKEND}/fairness/commit?tableId=${encodeURIComponent(tableId)}`)
  if (!res.ok) throw new Error('failed to get fairness commit')
  return res.json()
}

export async function fairnessReveal(tableId: string) {
  const res = await fetch(`${BACKEND}/fairness/reveal?tableId=${encodeURIComponent(tableId)}`)
  if (!res.ok) throw new Error('failed to get fairness reveal')
  return res.json()
}

export async function adminReset(token: string) {
  const res = await fetch(`${BACKEND}/admin/reset`, { method: 'POST', headers: authHeaders(token) })
  if (!res.ok) throw new Error('failed to reset tournament')
  return res.json()
}

export async function adminStartNow(token: string) {
  const res = await fetch(`${BACKEND}/admin/startNow`, { method: 'POST', headers: authHeaders(token) })
  if (!res.ok) throw new Error('failed to start tournament')
  return res.json()
}

export async function adminStatus(token: string) {
  const res = await fetch(`${BACKEND}/admin/status`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error('failed to fetch admin status')
  return res.json()
}

export async function adminSetAutoAdvance(enabled: boolean, token: string) {
  const res = await fetch(`${BACKEND}/admin/autoAdvance?enabled=${enabled}`, { method: 'POST', headers: authHeaders(token) })
  if (!res.ok) throw new Error('failed to set auto advance')
  return res.json()
}

export async function adminResetSession(token: string) {
  const res = await fetch(`${BACKEND}/admin/hu/resetSession`, { method: 'POST', headers: authHeaders(token) })
  const txt = await res.text()
  if (!res.ok) throw new Error(txt || 'failed to reset session')
  try { return JSON.parse(txt) } catch { return { ok:true } }
}

export async function adminResetAll(token: string) {
  const res = await fetch(`${BACKEND}/admin/hu/resetAll`, { method: 'POST', headers: authHeaders(token) })
  const txt = await res.text()
  if (!res.ok) throw new Error(txt || 'failed to reset all')
  try { return JSON.parse(txt) } catch { return { ok:true } }
}

export async function adminListProfiles(token: string) {
  const res = await fetch(`${BACKEND}/admin/profiles`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error('failed to load profiles')
  return res.json()
}

// Heads-up API
export async function huStatus(wallet?: string) {
  const url = wallet ? `${BACKEND}/hu/status/${wallet}` : `${BACKEND}/hu/status`
  const res = await fetch(url)
  if (!res.ok) throw new Error('failed to get hu status')
  return res.json()
}

export async function huPostMatchLock(wallet: string): Promise<{ locked: boolean; lockedUntilMs?: number }> {
  const res = await fetch(`${BACKEND}/hu/post-match-lock/${encodeURIComponent(wallet)}`)
  if (!res.ok) return { locked: false }
  return res.json()
}

export async function huJoin(wallet: string) {
  const res = await fetch(`${BACKEND}/hu/join/${encodeURIComponent(wallet)}`, { method: 'POST' })
  const body = await res.json().catch(() => ({}))
  if (res.status === 403 && body.locked && typeof body.lockedUntilMs === 'number') {
    const e = new Error('Post-match lock') as Error & { locked?: boolean; lockedUntilMs?: number }
    e.locked = true
    e.lockedUntilMs = body.lockedUntilMs
    throw e
  }
  if (!res.ok) throw new Error('failed to join hu queue')
  return body
}

export async function huLeave(wallet: string) {
  const res = await fetch(`${BACKEND}/hu/leave/${wallet}`, { method: 'POST' })
  if (!res.ok) throw new Error('failed to leave hu queue')
  return res.json()
}

// Bot queue
export async function huBotJoin(wallet: string) {
  const res = await fetch(`${BACKEND}/hu/bot/join/${encodeURIComponent(wallet)}`, { method: 'POST' })
  const body = await res.json().catch(() => ({}))
  if (res.status === 403 && body.locked && typeof body.lockedUntilMs === 'number') {
    const e = new Error('Post-match lock') as Error & { locked?: boolean; lockedUntilMs?: number }
    e.locked = true
    e.lockedUntilMs = body.lockedUntilMs
    throw e
  }
  if (!res.ok) throw new Error('failed to join bot queue')
  return body
}
export async function huBotStatus(wallet: string) {
  const res = await fetch(`${BACKEND}/hu/bot/status/${wallet}`)
  if (!res.ok) throw new Error('failed to get bot status')
  return res.json()
}

export async function huLeaderboard() {
  const res = await fetch(`${BACKEND}/hu/leaderboard`)
  if (!res.ok) throw new Error('failed to load leaderboard')
  return res.json()
}

// ELO leaderboard
export async function huElo() {
  const res = await fetch(`${BACKEND}/hu/elo`)
  if (!res.ok) throw new Error('failed to load elo')
  return res.json()
}

export async function huSessionStats() {
  const res = await fetch(`${BACKEND}/hu/sessionStats`)
  if (!res.ok) throw new Error('failed to load session stats')
  return res.json()
}

export async function huLeague() {
  const res = await fetch(`${BACKEND}/hu/league`)
  if (!res.ok) throw new Error('failed to load league')
  return res.json()
}
export async function huLeagueVs(user: string) {
  const res = await fetch(`${BACKEND}/hu/league/vs?user=${encodeURIComponent(user)}`)
  if (!res.ok) throw new Error('failed to load head-to-head')
  return res.json()
}

// Solana Eligibility (SPL-Token Balance)
export async function solEligibility(address: string, mint?: string, threshold?: number) {
  const params = new URLSearchParams()
  params.set('address', address)
  if (mint) params.set('mint', mint)
  if (typeof threshold === 'number') params.set('threshold', String(threshold))
  const url = `${BACKEND}/sol/eligibility?${params.toString()}`
  const res = await fetch(url)
  const txt = await res.text()
  if (!res.ok) {
    try { const j = JSON.parse(txt); throw new Error(j?.error || 'failed to check eligibility') } catch { throw new Error(txt || 'failed to check eligibility') }
  }
  try { return JSON.parse(txt) } catch { return { ok:true, eligible:false, balance:0, threshold:0, decimals:0 } }
}

// Profiles
export async function getProfile(wallet: string) {
  const res = await fetch(`${BACKEND}/profile/${encodeURIComponent(wallet)}`)
  if (!res.ok) throw new Error('failed to load profile')
  return res.json()
}
export async function saveProfile(wallet: string, payload: { username: string, avatarUrl?: string }, signal?: AbortSignal) {
  const res = await fetch(`${BACKEND}/profile/${encodeURIComponent(wallet)}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal })
  if (!res.ok) throw new Error('failed to save profile')
  return res.json()
}

export async function uploadAvatar(wallet: string, file: File) {
  const form = new FormData()
  form.append('avatar', file)
  const res = await fetch(`${BACKEND}/profile/${encodeURIComponent(wallet)}/avatar`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('failed to upload avatar')
  return res.json()
}

// Admin authentication
export async function adminLogin(username: string, password: string) {
  const res = await fetch(`${BACKEND}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('admin login failed')
  return res.json()
}

// User auth (wallet binding)
export async function authWalletStatus(wallet: string) {
  const res = await fetch(`${BACKEND}/auth/wallet/${encodeURIComponent(wallet)}`)
  const txt = await res.text()
  if (!res.ok) throw new Error(txt || 'failed wallet status')
  try { return JSON.parse(txt) } catch { return { ok:false, taken:false } }
}
export async function authRegister(username: string, password: string, wallet: string) {
  const res = await fetch(`${BACKEND}/auth/register`, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username, password, wallet })
  })
  const txt = await res.text()
  if (!res.ok) {
    try { const j = JSON.parse(txt); throw new Error(j?.error || 'register failed') } catch { throw new Error(txt || 'register failed') }
  }
  try { return JSON.parse(txt) } catch { return { ok:true } }
}
export async function authLoginUser(username: string, password: string) {
  const res = await fetch(`${BACKEND}/auth/login`, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username, password })
  })
  const txt = await res.text()
  if (!res.ok) {
    try { const j = JSON.parse(txt); throw new Error(j?.error || 'login failed') } catch { throw new Error(txt || 'login failed') }
  }
  try { return JSON.parse(txt) } catch { return { ok:true } }
}

export async function authChangePassword(username: string, oldPassword: string, newPassword: string) {
  const res = await fetch(`${BACKEND}/auth/changePassword`, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username, oldPassword, newPassword })
  })
  const txt = await res.text()
  if (!res.ok) {
    try { const j = JSON.parse(txt); throw new Error(j?.error || 'change password failed') } catch { throw new Error(txt || 'change password failed') }
  }
  try { return JSON.parse(txt) } catch { return { ok:true } }
}

// --- CorePass login ---
export async function corepassCreateSession(): Promise<{ ok: boolean; sessionId: string; loginUri: string }> {
  const res = await fetch(`${BACKEND}/auth/corepass/session`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create CorePass session')
  return res.json()
}

export async function corepassPollSession(sessionId: string): Promise<{ ok: boolean; pending: boolean; authenticated: boolean; address?: string; coreId?: string }> {
  const res = await fetch(`${BACKEND}/auth/corepass/session/${encodeURIComponent(sessionId)}`)
  return res.json()
}

export async function corepassCallback(payload: { signature: string; session: string; coreID: string }): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND}/auth/corepass/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}
