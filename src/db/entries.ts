import type { Entry, Familiarity } from '../types'
import { createId, detectKind, nowIso } from '../lib/normalize'
import { getDb } from './database'

export async function listEntries(): Promise<Entry[]> {
  const db = await getDb()
  const all = await db.getAll('entries')
  return all
    .filter((e) => !e.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listAllEntriesIncludingDeleted(): Promise<Entry[]> {
  const db = await getDb()
  return db.getAll('entries')
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await getDb()
  const entry = await db.get('entries', id)
  if (!entry || entry.deletedAt) return undefined
  return entry
}

export async function putEntry(entry: Entry): Promise<Entry> {
  const db = await getDb()
  await db.put('entries', entry)
  return entry
}

export async function upsertEntries(entries: Entry[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('entries', 'readwrite')
  await Promise.all(entries.map((e) => tx.store.put(e)))
  await tx.done
}

export interface CreateEntryInput {
  text: string
  kind?: Entry['kind']
  context?: string
  note?: string
  tags?: string[]
  enrichment?: Entry['enrichment']
  familiarity?: Familiarity
}

export async function createEntry(input: CreateEntryInput): Promise<Entry> {
  const ts = nowIso()
  const entry: Entry = {
    id: createId(),
    text: input.text.trim(),
    kind: input.kind ?? detectKind(input.text),
    context: input.context?.trim() || undefined,
    note: input.note?.trim() || undefined,
    tags: input.tags ?? [],
    familiarity: input.familiarity ?? 'new',
    enrichment: input.enrichment,
    createdAt: ts,
    updatedAt: ts,
    lastReviewedAt: undefined,
  }
  return putEntry(entry)
}

export async function updateEntry(
  id: string,
  patch: Partial<Omit<Entry, 'id' | 'createdAt'>>,
): Promise<Entry | undefined> {
  const existing = await getEntry(id)
  if (!existing) return undefined
  const next: Entry = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  }
  return putEntry(next)
}

export async function softDeleteEntry(id: string): Promise<void> {
  const existing = await getEntry(id)
  if (!existing) return
  await putEntry({
    ...existing,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
  })
}

export async function reviewEntry(
  id: string,
  familiarity: Familiarity,
): Promise<Entry | undefined> {
  return updateEntry(id, {
    familiarity,
    lastReviewedAt: nowIso(),
  })
}

export function getRecentEntries(entries: Entry[], limit = 12): Entry[] {
  return [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function getStaleEntries(entries: Entry[], limit = 8): Entry[] {
  const familiarityRank: Record<Familiarity, number> = {
    new: 0,
    seen: 1,
    usable: 2,
  }
  return [...entries]
    .sort((a, b) => {
      const aTime = a.lastReviewedAt ?? a.createdAt
      const bTime = b.lastReviewedAt ?? b.createdAt
      const byTime = aTime.localeCompare(bTime)
      if (byTime !== 0) return byTime
      return familiarityRank[a.familiarity] - familiarityRank[b.familiarity]
    })
    .slice(0, limit)
}
