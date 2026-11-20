import { createContext, useContext, useEffect, useId, useRef } from 'react'
export interface PageInfo { title: string; path: string[]; onBack?: () => void; backLabel?: string; onAncestor?: (index: number) => void }
export interface Registration extends PageInfo { scope: string; priority: number }
export const Navigation = createContext<{ current: PageInfo; register: (id: string, page: Registration) => () => void } | null>(null)


export function usePageNavigation(page: PageInfo, scope: string, active = true, priority = 10) {
  const context = useContext(Navigation), id = useId(), handlers = useRef(page)
  handlers.current = page
  const register = context?.register, pathKey = JSON.stringify(page.path)
  const hasBack = Boolean(page.onBack), hasAncestor = Boolean(page.onAncestor)
  const { title, backLabel } = page
  useEffect(() => {
    if (!register || !active) return
    return register(id, { title, backLabel, path: JSON.parse(pathKey), scope, priority, onBack: hasBack ? () => handlers.current.onBack?.() : undefined, onAncestor: hasAncestor ? index => handlers.current.onAncestor?.(index) : undefined })
  }, [register, active, id, title, backLabel, pathKey, scope, priority, hasBack, hasAncestor])
}
