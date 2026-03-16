import { useCallback, useEffect, useRef, useState } from 'react'
import { corepassCreateSession, corepassPollSession } from '../api'

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')

export default function AuthPanel({ onLogin }: { onLogin: (p: { username: string; wallet: string }) => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'polling' | 'done' | 'error'>('idle')
  const [hint, setHint] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [appLinkUri, setAppLinkUri] = useState('')
  const [manualAddr, setManualAddr] = useState('')
  const [showManual, setShowManual] = useState(false)
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
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.loginUri)}`
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
          onLogin({ username: d.address.slice(0, 10), wallet: d.address })
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
      setHint('Enter a valid CorePass address (starts with cb).')
      return
    }
    stopPolling()
    setStatus('done')
    onLogin({ username: addr.slice(0, 10), wallet: addr })
  }, [manualAddr, onLogin, stopPolling])

  useEffect(() => { startLogin(); return stopPolling }, [startLogin, stopPolling])

  return (
    <div className="pg-auth">
      {/* Mobile: big CorePass button first */}
      {isMobile && appLinkUri && (
        <a href={appLinkUri} className="pg-auth-corepass-btn">
          Open in CorePass
        </a>
      )}

      {/* QR for desktop / fallback */}
      {qrUrl && !isMobile && (
        <div className="pg-auth-qr-wrap">
          <img src={qrUrl} alt="CorePass QR" width={180} height={180} />
        </div>
      )}

      {status === 'polling' && (
        <div className="pg-auth-waiting">
          <div className="pg-auth-dot" />
          Waiting for CorePass...
        </div>
      )}

      {status === 'error' && (
        <div className="pg-auth-retry">
          <button onClick={startLogin}>Retry</button>
        </div>
      )}

      {/* Manual fallback */}
      {!showManual ? (
        <button className="pg-auth-toggle" onClick={() => setShowManual(true)}>
          Enter address manually
        </button>
      ) : (
        <div className="pg-auth-manual">
          <input
            value={manualAddr}
            onChange={(e) => setManualAddr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') manualLogin() }}
            placeholder="cb09..."
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={manualLogin}>Sign in</button>
        </div>
      )}

      {hint && <div className="pg-auth-hint">{hint}</div>}

      <a href="https://corepass.net/" target="_blank" rel="noreferrer" className="pg-auth-link">
        Get CorePass
      </a>
    </div>
  )
}
