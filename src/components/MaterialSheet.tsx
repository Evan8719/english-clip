import { useEffect, useId, useRef, type ReactNode } from 'react'
import { NavIcon } from './NavIcon'

export function MaterialSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close() }, [])
  return <dialog ref={dialog} className="material-sheet" aria-labelledby={titleId} onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <div className="material-sheet-handle" /><header><h2 id={titleId}>{title}</h2><button className="icon-action" aria-label="关闭面板" onClick={onClose}><NavIcon name="close" /></button></header><div className="material-sheet-content">{children}</div>
  </dialog>
}
