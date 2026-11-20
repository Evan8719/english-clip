import { useEffect, useId, useRef, type ReactNode } from 'react'
import { NavIcon } from './NavIcon'

export function MaterialSheet({ title, onClose, children, variant = 'default', busy = false }: { title: string; onClose: () => void; children: ReactNode; variant?: 'default' | 'filters'; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close() }, [])
  return <dialog ref={dialog} className={`material-sheet fidelity-sheet ${variant === 'filters' ? 'filter-sheet' : ''}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => {
      if (busy || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <div className="material-sheet-handle" />
    <header><h2 id={titleId}>{title}</h2><button className="icon-action" aria-label="关闭面板" onClick={onClose} disabled={busy}><NavIcon name="close" /></button></header>
    <div className="material-sheet-content">{children}</div>
  </dialog>
}
