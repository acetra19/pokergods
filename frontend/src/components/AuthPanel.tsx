import { useMemo, useState } from 'react'
import { solEligibility, saveProfile, uploadAvatar, authWalletStatus, authRegister, authLoginUser } from '../api'

export default function AuthPanel({ onLogin }: { onLogin: (p: { username: string, wallet: string }) => void }){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [wallet, setWallet] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [elig, setElig] = useState<{ eligible: boolean, balance: number, threshold: number, decimals: number }|null>(null)
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  const canLogin = useMemo(() => !!username.trim() && !!password.trim() && !!wallet.trim(), [username, password, wallet])
  const canContinue = useMemo(() => canLogin && !!elig && !!elig.eligible, [canLogin, elig])
  const [walletTaken, setWalletTaken] = useState<{ taken:boolean, username?:string|null }|null>(null)

  const scan = async () => {
    setHint('')
    setLoading(true)
    try {
      const r = await solEligibility(wallet)
      setElig({ eligible: !!r.eligible, balance: Number(r.balance||0), threshold: Number(r.threshold||0), decimals: Number(r.decimals||0) })
      if (!r.eligible) setHelpOpen(true)
      // check wallet binding status
      try { const s = await authWalletStatus(wallet); setWalletTaken({ taken: !!s.taken, username: s.username || null }) } catch { setWalletTaken(null) }
    } catch (e:any) {
      setHint('Scan failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ border:'1px solid rgba(255,213,79,0.25)', padding:12, borderRadius:10, background:'rgba(26,8,48,0.95)' }}>
      <h3>Login</h3>
      <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'center' }}>
        <label>Username</label>
        <input value={username} onChange={(e)=> setUsername(e.target.value)} placeholder="username" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e)=> setPassword(e.target.value)} placeholder="password" />
        <label>Wallet</label>
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ flex:1 }} value={wallet} onChange={(e)=> setWallet(e.target.value)} placeholder="Solana address" />
          <button onClick={scan} disabled={!wallet || loading}>{loading? 'Scanning...' : 'Scan'}</button>
        </div>
        <label>Avatar</label>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <input type="file" accept="image/*" onChange={async (e)=>{
            const file = e.target.files?.[0]
            if (!file || !wallet) return
            try {
              const result = await uploadAvatar(wallet, file)
              if (result?.avatarUrl) setAvatarUrl(result.avatarUrl)
            } catch (err:any) {
              setHint(err?.message || 'Upload failed')
            }
          }} />
          <small style={{ opacity:0.75 }}>Upload a square image (server stored, resized).</small>
          {avatarUrl && (
            <div style={{ marginTop:4 }}>
              <img src={avatarUrl} alt="avatar preview" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'1px solid rgba(255,213,79,0.35)' }} />
            </div>
          )}
        </div>
      </div>
      {elig && (
        <div style={{ marginTop:8, fontSize:13 }}>
          Eligibility: {elig.eligible ? 'OK' : 'Not eligible'} · Balance: {elig.balance} / {elig.threshold}
        </div>
      )}
      {!elig && (
        <div style={{ marginTop:6, fontSize:12, opacity:0.85 }}>Please scan your wallet to proceed.</div>
      )}
      {elig && !elig.eligible && (
        <div style={{ marginTop:6, fontSize:12, color:'#ffc8a6' }}>Insufficient token balance – login is blocked.</div>
      )}
      {hint && <div style={{ color:'#b00', marginTop:6 }}>{hint}</div>}
      <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
        {!walletTaken?.taken ? (
          <button onClick={async ()=>{
            try {
              // register will block wallet for future
              await authRegister(username, password, wallet)
              try { await saveProfile(wallet, { username, avatarUrl }) } catch {}
              onLogin({ username, wallet })
            } catch (e:any) { setHint(e?.message||'Register failed') }
          }} disabled={!canContinue}>Create Account</button>
        ) : (
          <button onClick={async ()=>{
            try {
              const r = await authLoginUser(username, password)
              onLogin({ username: r?.user?.username || username, wallet: r?.user?.wallet || wallet })
            } catch (e:any) { setHint(e?.message||'Login failed') }
          }} disabled={!canLogin}>Login</button>
        )}
        <button className="btn" onClick={async ()=>{
          try { await saveProfile(wallet, { username, avatarUrl }) } catch {}
          alert('Saved')
        }} disabled={!canLogin}>Save Profile</button>
      </div>
      {walletTaken?.taken && (
        <div style={{ marginTop:6, fontSize:12, color:'#ffd54f' }}>Wallet already linked to <b>{walletTaken.username}</b>. Please log in with username/password.</div>
      )}
      {helpOpen && elig && !elig.eligible && (
        <div style={{ marginTop:12, padding:10, borderRadius:10, border:'1px solid rgba(255,213,79,0.25)', background:'rgba(26,8,48,0.9)' }}>
          <div style={{ fontWeight:800, marginBottom:6 }}>Need $PPT to play?</div>
          <div style={{ fontSize:13, opacity:0.95, marginBottom:8 }}>
            You need at least <b>{elig.threshold}</b> tokens in this wallet. Visit the token page and acquire more, then re‑scan.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <a className="btn btn-primary" href="https://pump.fun/coin/4ikwYoNvoGEwtMbziUyYBTz1zRM6nmxspsfw9G7Bpump" target="_blank" rel="noreferrer">Open $PPT on pump.fun</a>
            <button className="btn" onClick={()=> setHelpOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
