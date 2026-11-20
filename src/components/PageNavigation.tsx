import { useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Navigation, type PageInfo, type Registration } from '../lib/pageNavigation'
import { NavIcon } from './NavIcon'


export function PageNavigationProvider({ scope, base, children }: { scope: string; base: PageInfo; children: ReactNode }) {
  const [pages, setPages] = useState(new Map<string, Registration>())
  const register = useCallback((id: string, page: Registration) => {
    setPages(previous => new Map(previous).set(id, page))
    return () => setPages(previous => { const next = new Map(previous); next.delete(id); return next })
  }, [])
  const current = [...pages.values()].filter(page => page.scope === scope).sort((a,b) => b.priority - a.priority)[0] || base
  return <Navigation.Provider value={{ current, register }}>{children}</Navigation.Provider>
}


export function GlobalPageHeader({ onSettings }: { onSettings: (title: string) => void }) {
  const page = useContext(Navigation)?.current
  const headerRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const header = headerRef.current, shell = header?.closest<HTMLElement>('.fidelity-shell')
    if (!header || !shell) return
    const measure = () => shell.style.setProperty('--header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  if (!page) return null
  return <header ref={headerRef} className="fidelity-global-header"><div className="fidelity-header-row">
    <div className={`fidelity-header-left${page.onBack ? ' has-back' : ''}`}>{page.onBack && <button className="fidelity-icon" aria-label={`返回${page.backLabel || page.path.at(-2) || '本子'}`} onClick={page.onBack}><NavIcon name="previous" /></button>}<img src={`${import.meta.env.BASE_URL}clip-wordcard.webp`} alt="" /></div>
    <strong className="fidelity-brand" lang="en">English Clip</strong>
    <button className="fidelity-icon" aria-label="全局设置" onClick={() => onSettings(page.title)}><NavIcon name="settings" /></button>
  </div>{page.path.length > 1 && <nav className="fidelity-breadcrumb" aria-label="当前位置">{page.path.map((part, index) => {
    const last = index === page.path.length - 1
    return <span key={index}>{index > 0 && <NavIcon name="next" />}{!last && page.onAncestor ? <button title={part} onClick={() => page.onAncestor?.(index)}>{part}</button> : <span title={part} aria-current={last ? 'page' : undefined}>{part}</span>}</span>
  })}</nav>}</header>
}
