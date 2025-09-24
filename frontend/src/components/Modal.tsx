import type { ReactNode } from 'react'
import { useEffect } from 'react'

export default function Modal({ open, title, onClose, children }: { open: boolean, title?: string, onClose: ()=>void, children: ReactNode }){
  useEffect(()=>{
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="pg-modal" role="dialog" aria-modal="true">
      <div className="pg-modal-backdrop" onClick={onClose} />
      <div className="pg-modal-card">
        <div className="pg-modal-head">
          <div className="pg-modal-title">{title ?? ''}</div>
          <button className="pg-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pg-modal-body">{children}</div>
      </div>
    </div>
  )
}
