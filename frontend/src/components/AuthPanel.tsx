import { useCallback, useEffect, useRef, useState } from 'react'
import { corepassCreateSession, corepassPollSession, BACKEND } from '../api'

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')

export default function AuthPanel({ onLogin }: { onLogin: (p: { username: string; wallet: string }) => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'polling' | 'done' | 'error'>('idle')
  const [hint, setHint] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [appLinkUri, setAppLinkUri] = useState('')
  const [manualAddr, setManualAddr] = useState('')
  const sessionRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
  }, [])

  const startLogin = useCallback(async () => {
    setStatus('loading')
    setHint('')
    stopPolling()
    try {
      const data = await corepassCreateSession()
      if (!data.ok || !data.sessionId) { setHint('Could not create session'); setStatus('error'); return }
      sessionRef.current = data.sessionId

      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.loginUri)}`
      setQrUrl(qr)

      if (isMobile) {
        const returnUrl = window.location.origin + window.location.pathname
        const uri = 'corepass:login/?sess=' + encodeURIComponent(data.sessionId) +
          '&conn=' + encodeURIComponent(returnUrl) + '&type=app-link'
        setAppLinkUri(uri)
      }

      setStatus('polling')
      poll(data.sessionId)
    } catch (e: any) {
      setHint(e?.message || 'Network error')
      setStatus('error')
    }
  }, [stopPolling])

  const poll = useCallback((sid: string) => {
    corepassPollSession(sid)
      .then((d) => {
        if (d.authenticated && d.address) {
          setStatus('done')
          const short = d.address.slice(0, 10)
          onLogin({ username: short, wallet: d.address })
          return
        }
        if (d.ok || d.pending) {
          pollRef.current = setTimeout(() => poll(sid), 2000)
        }
      })
      .catch(() => { pollRef.current = setTimeout(() => poll(sid), 3000) })
  }, [onLogin])

  const manualLogin = useCallback(() => {
    const addr = manualAddr.trim().toLowerCase()
    if (!addr || !addr.startsWith('cb') || addr.length < 10) {
      setHint('Please enter a valid CorePass address (starts with cb).')
      return
    }
    stopPolling()
    setStatus('done')
    onLogin({ username: addr.slice(0, 10), wallet: addr })
  }, [manualAddr, onLogin, stopPolling])

  useEffect(() => {
    startLogin()
    return stopPolling
  }, [startLogin, stopPolling])

  return (
    <div style={{
      border: '1px solid rgba(107,127,255,0.25)',
      padding: 24,
      borderRadius: 16,
      background: 'rgba(16,16,24,0.95)',
      maxWidth: 420,
      margin: '0 auto',
      textAlign: 'center',
    }}>
      <div style={{
        display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 12,
        background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
        color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16,
      }}>
        CorePass Login
      </div>

      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
        Sign in with <span style={{ color: '#6b7fff' }}>CorePass</span>
      </h2>
      <p style={{ color: '#8b8b9a', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        Scan the QR code with your CorePass app{isMobile ? ' or tap the button below' : ''} to sign in.
      </p>

      {qrUrl && (
        <div style={{
          background: '#fff', padding: 12, borderRadius: 14,
          display: 'inline-block', marginBottom: 12,
        }}>
          <img src={qrUrl} alt="CorePass Login QR" width={200} height={200} style={{ display: 'block' }} />
        </div>
      )}

      {status === 'polling' && (
        <div style={{ fontSize: 13, color: '#8b8b9a', marginBottom: 12 }}>
          Waiting for CorePass confirmation…
        </div>
      )}

      {isMobile && appLinkUri && (
        <div style={{ marginBottom: 16 }}>
          <a
            href={appLinkUri}
            style={{
              display: 'block', padding: '12px 20px', borderRadius: 12,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff', fontWeight: 600, fontSize: 16, textDecoration: 'none',
              textAlign: 'center', transition: 'transform 0.15s',
            }}
          >
            Open in CorePass
          </a>
          <div style={{ fontSize: 12, color: '#8b8b9a', marginTop: 6 }}>
            Tap to sign in directly on this device
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '16px 0', color: '#4a4a5a', fontSize: 13,
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(107,127,255,0.12)' }} />
        or enter manually
        <div style={{ flex: 1, height: 1, background: 'rgba(107,127,255,0.12)' }} />
      </div>

      <div style={{ textAlign: 'left' }}>
        <label style={{ display: 'block', color: '#8b8b9a', fontSize: 13, marginBottom: 4 }}>
          CorePass address (cb…)
        </label>
        <input
          value={manualAddr}
          onChange={(e) => setManualAddr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') manualLogin() }}
          placeholder="cb09..."
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 15,
            border: '1px solid rgba(107,127,255,0.2)', background: 'rgba(12,12,16,0.9)',
            color: '#e6e6e6', marginBottom: 10, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={manualLogin}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#fff',
            background: 'linear-gradient(135deg, #6b7fff, #8b5cf6)',
          }}
        >
          Sign in with address
        </button>
      </div>

      {hint && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{hint}</div>}

      <div style={{ marginTop: 20, fontSize: 12, color: '#4a4a5a' }}>
        <a href="https://corepass.net/" target="_blank" rel="noreferrer" style={{ color: '#6b7fff', textDecoration: 'none' }}>
          Get CorePass
        </a>
      </div>
    </div>
  )
}
