import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Entry } from '../types'
import {
  listAllEntriesIncludingDeleted,
  upsertEntries,
} from '../db/entries'
import { getDb } from '../db/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null
let syncTimer: number | null = null

export function isSyncConfigured(): boolean {
  return Boolean(url && anonKey)
}

function getClient(): SupabaseClient | null {
  if (!isSyncConfigured()) return null
  if (!client) {
    client = createClient(url!, anonKey!)
  }
  return client
}

export async function getCurrentUser(): Promise<User | null> {
  const sb = getClient()
  if (!sb) return null
  const { data } = await sb.auth.getUser()
  return data.user
}

export async function signInAnonymously(): Promise<User | null> {
  const sb = getClient()
  if (!sb) return null
  const existing = await getCurrentUser()
  if (existing) return existing
  const { data, error } = await sb.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

export async function signInWithEmail(email: string, password: string): Promise<User | null> {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUpWithEmail(email: string, password: string): Promise<User | null> {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw error
  return data.user
}

export async function signOut(): Promise<void> {
  const sb = getClient()
  if (!sb) return
  await sb.auth.signOut()
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
  const sb = getClient()
  if (!sb) {
    return { ok: false, message: '未配置 Supabase（可选）' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, message: '未登录' }
  }

  const local = await listAllEntriesIncludingDeleted()
  const { data, error } = await sb
    .from('entries')
    .select('payload')
    .eq('user_id', user.id)

  if (error) {
    return { ok: false, message: error.message }
  }

  const remote = (data ?? [])
    .map((row) => row.payload as Entry)
    .filter(Boolean)

  const merged = mergeByUpdatedAt(local, remote)
  await upsertEntries(merged)

  const upserts = merged.map((entry) => ({
    id: entry.id,
    user_id: user.id,
    updated_at: entry.updatedAt,
    payload: entry,
  }))

  const { error: upError } = await sb.from('entries').upsert(upserts)
  if (upError) {
    return { ok: false, message: upError.message }
  }

  const db = await getDb()
  await db.put('meta', { key: 'lastSyncAt', value: new Date().toISOString() })
  return { ok: true, message: `已同步 ${merged.length} 条` }
}

export function scheduleSilentSync(): void {
  if (!isSyncConfigured()) return
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
