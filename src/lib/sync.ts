import type { Entry } from '../types'
import { mergeRemoteEntries } from '../db/entries'
import { getDb } from '../db/database'
import { readSession, storeSession, type SyncUser } from './session'

export { getStoredUserId } from './session'
export type { SyncUser } from './session'

/**
 * 云同步（自建后端版）
 *
 * 后端：english-clip 原生 Node 服务（见 nas/server.mjs）
 * 认证：邮箱 + 密码 → Bearer Token 存 localStorage（不用 Cookie，跨域友好）
 * 语义：与 Supabase 版保持一致——本地优先，按 updatedAt 取新，双向合并。
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const API_BASE = RAW_BASE.replace(/\/$/, '')

let syncTimer: number | null = null

function getToken(): string {
  return readSession().token
}

export function authorizedApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' })
}

async function call(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {}
  const token = options.token ?? getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })

  let data: Record<string, unknown> = {}
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    data = {}
  }
  return { status: response.status, data }
}

/** 后端始终随前端一起部署，永远可用 */
export function isSyncConfigured(): boolean {
  return true
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}
export async function getCurrentUser(): Promise<SyncUser | null> {
  const { token, user: cachedUser } = readSession()
  if (!token) return null
  try {
    const { status, data } = await call('/api/auth/me', { token })
    if (getToken() !== token) return readSession().user
    if (status === 401) {
      storeSession(null, null)
      return null
    }
    if (status !== 200) return cachedUser
    const user = data.user as SyncUser
    storeSession(token, user)
    return user
  } catch {
    // 离线时保留本地会话，不打断使用
    return readSession().user
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SyncUser | null> {
  const { status, data } = await call('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    token: '',
  })
  if (status !== 200) {
    throw new Error(String(data.message || '登录失败'))
  }
  storeSession(String(data.token), data.user as SyncUser)
  return data.user as SyncUser
}

export async function signUpWithEmail(
  email: string,
  password: string,
  inviteCode = '',
): Promise<SyncUser | null> {
  const { status, data } = await call('/api/auth/register', {
    method: 'POST',
    body: { email, password, inviteCode },
    token: '',
  })
  if (status !== 200) {
    throw new Error(String(data.message || '注册失败'))
  }
  storeSession(String(data.token), data.user as SyncUser)
  return data.user as SyncUser
}

export async function signOut(): Promise<void> {
  const token = getToken()
  storeSession(null, null)
  if (token) {
    try {
      await call('/api/auth/logout', { method: 'POST', token })
    } catch {
      /* 离线也允许本地退出 */
    }
  }
}

export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  const { token, user } = readSession()
  if (!token || !user?.id) {
    return { ok: false, message: '未登录' }
  }
  const notebook = `account:${user.id}`
  const sessionMatches = () => {
    const current = readSession()
    return current.token === token && current.user?.id === user.id
  }
  const sessionChanged = { ok: false, message: '登录状态已改变，请重新同步' }

  try {
    const pulled = await call('/api/entries', { token })
    if (!sessionMatches()) return sessionChanged
    if (pulled.status !== 200) {
      return { ok: false, message: String(pulled.data.message || '同步失败') }
    }
    const remote = ((pulled.data.entries as Entry[]) ?? []).filter(Boolean)
    const pending = await mergeRemoteEntries(notebook, remote)
    if (!sessionMatches()) return sessionChanged
    window.dispatchEvent(new Event('english-clip:entries-synced'))

    if (pending.length) {
      const pushed = await call('/api/entries', {
        method: 'POST', token, body: { entries: pending },
      })
      if (!sessionMatches()) return sessionChanged
      if (pushed.status !== 200) return { ok: false, message: String(pushed.data.message || '上传失败') }
    }

    const db = await getDb()
    await db.put('meta', { key: `lastSyncAt:${notebook}`, value: new Date().toISOString() })
    return { ok: true, message: '本子已同步' }
  } catch (error) {
    return { ok: false, message: (error as Error).message || '网络不通，稍后再试' }
  }
}

export function scheduleSilentSync(): void {
  if (syncTimer != null) window.clearTimeout(syncTimer)
  const token = getToken()
  if (!token) return
  syncTimer = window.setTimeout(() => {
    if (getToken() === token) void syncNow()
  }, 1200)
}

export async function getLastSyncAt(): Promise<string | null> {
  const user = readSession().user
  if (!user) return null
  const db = await getDb()
  const row = await db.get('meta', `lastSyncAt:account:${user.id}`)
  return (row?.value as string) ?? null
}
