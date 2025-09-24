import { useEffect, useState } from 'react'
import { getProfile, saveProfile, uploadAvatar, authChangePassword } from '../api'

export default function ProfilePanel({ wallet }: { wallet: string }){
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [hint, setHint] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(()=>{
    if (!wallet) return
    setLoading(true)
    getProfile(wallet).then((r:any)=>{
      setUsername(r?.profile?.username || '')
      const url = r?.profile?.avatarUrl || ''
      setAvatarUrl(url ? `${url}?v=${Date.now()}` : '')
    }).catch(()=>{ setHint('Profil konnte nicht geladen werden.') }).finally(()=> setLoading(false))
  }, [wallet])

  const onSave = async () => {
    setHint('')
    if (!username.trim()) { setHint('Bitte Username angeben.'); return }
    try {
      await saveProfile(wallet, { username, avatarUrl })
      setHint('Gespeichert ✓')
      // Optional: lokalen Cache setzen
      try { localStorage.setItem(`profile:${wallet}`, JSON.stringify({ username, avatarUrl })) } catch {}
    } catch { setHint('Speichern fehlgeschlagen.') }
  }

  return (
    <div style={{ border:'1px solid rgba(255,213,79,0.25)', padding:12, borderRadius:10, background:'rgba(26,8,48,0.95)' }}>
      <h3>Your Profile</h3>
      <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'center' }}>
        <label>Wallet</label>
        <input value={wallet} readOnly />
        <label>Username</label>
        <input value={username} onChange={(e)=> setUsername(e.target.value)} placeholder="your display name" />
        <label>Avatar</label>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <input type="file" accept="image/*" onChange={async (e)=>{
            const file = e.target.files?.[0]
            if (!file || !wallet) return
            try {
              const result = await uploadAvatar(wallet, file)
              if (result?.avatarUrl) {
                const bust = `${result.avatarUrl}?v=${Date.now()}`
                setAvatarUrl(bust)
                // Update session cache so other views (e.g., table) see the new avatar
                try {
                  const raw = sessionStorage.getItem('pg_profile_cache')
                  const obj = raw ? JSON.parse(raw) : {}
                  obj[wallet] = { name: username || wallet, avatar: result.avatarUrl }
                  sessionStorage.setItem('pg_profile_cache', JSON.stringify(obj))
                } catch {}
              }
              setHint('Avatar uploaded ✓')
            } catch { setHint('Upload fehlgeschlagen.') }
          }} />
          <small style={{ opacity:0.75 }}>Upload replaces your avatar (stored and resized server-side).</small>
        </div>
      </div>
      <div style={{ marginTop:10, display:'flex', gap:12, alignItems:'center' }}>
        <button className="btn btn-success" onClick={onSave} disabled={loading}>Save</button>
        {hint && <span style={{ fontSize:12, opacity:0.9 }}>{hint}</span>}
      </div>
      <div style={{ marginTop:14 }}>
        <b>Preview</b>
        <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:6 }}>
          <div style={{ width:42, height:42, borderRadius:999, background:'#3b1a6a', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', border:'1px solid rgba(255,213,79,0.28)' }}>
            {avatarUrl ? (<img src={avatarUrl} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />) : (<span style={{ fontWeight:800 }}>{(username||wallet).slice(0,2).toUpperCase()}</span>)}
          </div>
          <div style={{ fontWeight:800 }}>{username || '(no username set)'}</div>
        </div>
      </div>
      <div style={{ marginTop:16 }}>
        <b>Change Password</b>
        <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'center', marginTop:6 }}>
          <label>Old Password</label>
          <input type="password" value={oldPassword} onChange={(e)=> setOldPassword(e.target.value)} placeholder="old password" />
          <label>New Password</label>
          <input type="password" value={newPassword} onChange={(e)=> setNewPassword(e.target.value)} placeholder="new password" />
        </div>
        <div style={{ marginTop:10 }}>
          <button className="btn btn-primary" onClick={async ()=>{
            setHint('')
            if (!username || !oldPassword || !newPassword) { setHint('Please fill all password fields.'); return }
            try {
              await authChangePassword(username, oldPassword, newPassword)
              setHint('Password changed ✓')
              setOldPassword(''); setNewPassword('')
            } catch(e:any){ setHint(e?.message||'Password change failed') }
          }} disabled={loading || !oldPassword || !newPassword}>Change Password</button>
        </div>
      </div>
    </div>
  )
}


