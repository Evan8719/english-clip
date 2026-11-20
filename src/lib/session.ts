export interface SyncUser {
  id: string
  email: string | null
}

const TOKEN_KEY = 'english-clip.api.token'
const USER_KEY = 'english-clip.api.user'
const SESSION_KEY = 'english-clip.api.session'
export const SESSION_CHANGE = 'english-clip:session-change'

export function readSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored !== null) {
      const session = JSON.parse(stored) as { token?: string; user?: SyncUser | null } | null
      const token = typeof session?.token === 'string' ? session.token : ''
      return { token, user: token && session?.user?.id ? session.user : null }
    }
    const token = localStorage.getItem(TOKEN_KEY) || ''
    const user = token ? JSON.parse(localStorage.getItem(USER_KEY) || 'null') as SyncUser | null : null
    return { token, user }
  } catch {
    return { token: '', user: null }
  }
}

export function getStoredUserId() {
  return readSession().user?.id || ''
}

export function getNotebookId() {
  const id = getStoredUserId()
  return id ? `account:${id}` : 'device'
}

export function observeSession(listener: () => void) {
  function fromOtherTab(event: StorageEvent) {
    if (event.key === SESSION_KEY || event.key === TOKEN_KEY || event.key === USER_KEY || event.key === null) listener()
  }
  window.addEventListener(SESSION_CHANGE, listener)
  window.addEventListener('storage', fromOtherTab)
  return () => {
    window.removeEventListener(SESSION_CHANGE, listener)
    window.removeEventListener('storage', fromOtherTab)
  }
}

export function storeSession(token: string | null, user: SyncUser | null) {
  const previous = readSession()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: token || '', user }))
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  if (previous.token !== (token || '') || previous.user?.id !== user?.id) {
    window.dispatchEvent(new Event(SESSION_CHANGE))
  }
}
