import type { Entry } from '../types'
import {
  listAllEntriesIncludingDeleted,
  upsertEntries,
} from '../db/entries'
import { getDb } from '../db/database'

/**
 * 云同步（自建后端版）
 *
 * 后端：english-clip 原生 Node 服务（见 nas/server.mjs）
 * 认证：邮箱 + 密码 → Bearer Token 存 localStorage（不用 Cookie，跨域友好）
 * 语义：与 Supabase 版保持一致——本地优先，按 updatedAt 取新，双向合并。
 */

export interface SyncUser {
  id: string
  email: string | null
}

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const API_BASE = RAW_BASE.replace(/\/$/, '')
const TOKEN_KEY = 'english-clip.api.token'
const USER_KEY = 'english-clip.api.user'

let syncTimer: number | null = null
let cachedUser: SyncUser | null = readStoredUser()

function readStoredUser(): SyncUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as SyncUser) : null
  } catch {
    return null
  }
}

function storeSession(token: string | null, user: SyncUser | null) {
  cachedUser = user
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
}

function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
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
  if (!getToken()) {
    storeSession(null, null)
    return null
  }
  try {
    const { status, data } = await call('/api/auth/me')
    if (status !== 200) {
      storeSession(null, null)
      return null
    }
    const user = data.user as SyncUser
    storeSession(getToken(), user)
    return user
  } catch {
    // 离线时保留本地会话，不打断使用
    return cachedUser
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
  if (getToken()) {
    try {
      await call('/api/auth/logout', { method: 'POST' })
    } catch {
      /* 离线也允许本地退出 */
    }
  }
  storeSession(null, null)
}

function mergeByUpdatedAt(local: Entry[], remote: Entry[]): Entry[] {
  const map = new Map<string, Entry>()
  for (const entry of [...remote, ...local]) {
    const prev = map.get(entry.id)
    if (!prev || entry.updatedAt > prev.updatedAt) {
      map.set(entry.id, entry)
    }
  }
  return [...map.values()]
}

export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  if (!getToken()) {
    return { ok: false, message: '未登录' }
  }

  try {
    const pulled = await call('/api/entries')
    if (pulled.status !== 200) {
      return { ok: false, message: String(pulled.data.message || '同步失败') }
    }
    const remote = ((pulled.data.entries as Entry[]) ?? []).filter(Boolean)
    const local = await listAllEntriesIncludingDeleted()
    const merged = mergeByUpdatedAt(local, remote)
    await upsertEntries(merged)

    const pushed = await call('/api/entries', {
      method: 'POST',
      body: { entries: merged },
    })
    if (pushed.status !== 200) {
      return { ok: false, message: String(pushed.data.message || '上传失败') }
    }

    const db = await getDb()
    await db.put('meta', { key: 'lastSyncAt', value: new Date().toISOString() })
    return { ok: true, message: `已同步 ${merged.length} 条` }
  } catch (error) {
    return { ok: false, message: (error as Error).message || '网络不通，稍后再试' }
  }
}

export function scheduleSilentSync(): void {
  if (!getToken()) return
  if (syncTimer != null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    void syncNow()
  }, 1200)
}

export async function getLastSyncAt(): Promise<string | null> {
  const db = await getDb()
  const row = await db.get('meta', 'lastSyncAt')
  return (row?.value as string) ?? null
}
