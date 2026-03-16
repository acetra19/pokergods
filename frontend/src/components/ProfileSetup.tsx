import { useState, useRef } from 'react'
import { saveProfile, uploadAvatar } from '../api'

interface Props {
  wallet: string
  onComplete: () => void
}

const AVATARS = ['🎯', '🃏', '♠️', '🔥', '💎', '🐉', '🦅', '🎲', '🏆', '👑', '⚡', '🌊']

export default function ProfileSetup({ wallet, onComplete }: Props) {
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      const result = await uploadAvatar(wallet, file)
      if (result?.avatarUrl) {
        setAvatarUrl(`${result.avatarUrl}?v=${Date.now()}`)
        try {
          const raw = sessionStorage.getItem('pg_profile_cache')
          const obj = raw ? JSON.parse(raw) : {}
          obj[wallet] = { name: name || wallet, avatar: result.avatarUrl }
          sessionStorage.setItem('pg_profile_cache', JSON.stringify(obj))
        } catch {}
      }
    } catch {
      setError('Upload failed — try a smaller image.')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please pick a name.'); return }
    if (trimmed.length < 2 || trimmed.length > 20) { setError('Name must be 2–20 characters.'); return }
    setSaving(true)
    setError('')
    try {
      await saveProfile(wallet, { username: trimmed, avatarUrl: avatarUrl.split('?')[0] })
      try {
        localStorage.setItem(`profile:${wallet}`, JSON.stringify({ username: trimmed, avatarUrl }))
      } catch {}
      onComplete()
    } catch {
      setError('Could not save — please retry.')
      setSaving(false)
    }
  }

  return (
    <div className="card theme-pokergods pg-login-gate">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: 2, color: '#8b5cf6', textTransform: 'uppercase' as const }}>POKERGODS</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 6 }}>Create Your Profile</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Pick a name and avatar so others can see you at the table.</div>
      </div>

      {/* Avatar */}
      <div className="pg-setup-avatar-wrap">
        <div className="pg-setup-avatar" onClick={() => fileRef.current?.click()}>
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" />
            : <span className="pg-setup-avatar-placeholder">📷</span>
          }
          <div className="pg-setup-avatar-badge">{uploading ? '...' : '✏️'}</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUpload(f)
        }} />
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Tap to upload photo</div>
      </div>

      {/* Quick emoji avatars */}
      <div className="pg-setup-emoji-row">
        {AVATARS.map((em) => (
          <button key={em} className="pg-setup-emoji" onClick={() => setName((n) => n || em)}>
            {em}
          </button>
        ))}
      </div>

      {/* Name */}
      <div className="pg-setup-field">
        <label>Display Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. PokerKing42"
          maxLength={20}
          autoFocus
        />
      </div>

      {error && <div className="pg-setup-error">{error}</div>}

      <button className="pg-setup-continue" onClick={handleSave} disabled={saving || uploading}>
        {saving ? 'Saving...' : 'Continue'}
      </button>

      <button className="pg-setup-skip" onClick={onComplete}>
        Skip for now
      </button>
    </div>
  )
}
