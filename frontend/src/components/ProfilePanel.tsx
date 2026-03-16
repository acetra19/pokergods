import { useEffect, useState } from 'react'
import { getProfile, saveProfile, uploadAvatar } from '../api'

export default function ProfilePanel({ wallet }: { wallet: string }) {
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!wallet) return
    setLoading(true)
    getProfile(wallet).then((r: any) => {
      setUsername(r?.profile?.username || '')
      const url = r?.profile?.avatarUrl || ''
      setAvatarUrl(url ? `${url}?v=${Date.now()}` : '')
    }).catch(() => setHint('Could not load profile.'))
      .finally(() => setLoading(false))
  }, [wallet])

  const onSave = async () => {
    setHint('')
    if (!username.trim()) { setHint('Please enter a username.'); return }
    try {
      await saveProfile(wallet, { username, avatarUrl })
      setHint('Saved!')
      try { localStorage.setItem(`profile:${wallet}`, JSON.stringify({ username, avatarUrl })) } catch {}
    } catch { setHint('Save failed.') }
  }

  return (
    <div className="pg-profile">
      {/* Avatar preview */}
      <div className="pg-profile-avatar-section">
        <div className="pg-profile-avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" />
            : <span>{(username || wallet).slice(0, 2).toUpperCase()}</span>
          }
        </div>
        <div className="pg-profile-name">{username || wallet.slice(0, 12)}</div>
        <div className="pg-profile-wallet">{wallet}</div>
      </div>

      {/* Fields */}
      <div className="pg-profile-fields">
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your display name"
        />

        <label>Avatar</label>
        <input
          type="file"
          accept="image/*"
          className="pg-profile-file"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file || !wallet) return
            try {
              const result = await uploadAvatar(wallet, file)
              if (result?.avatarUrl) {
                setAvatarUrl(`${result.avatarUrl}?v=${Date.now()}`)
                try {
                  const raw = sessionStorage.getItem('pg_profile_cache')
                  const obj = raw ? JSON.parse(raw) : {}
                  obj[wallet] = { name: username || wallet, avatar: result.avatarUrl }
                  sessionStorage.setItem('pg_profile_cache', JSON.stringify(obj))
                } catch {}
              }
              setHint('Avatar uploaded!')
            } catch { setHint('Upload failed.') }
          }}
        />
      </div>

      <button className="pg-profile-save" onClick={onSave} disabled={loading}>
        Save Profile
      </button>
      {hint && <div className="pg-profile-hint">{hint}</div>}
    </div>
  )
}
