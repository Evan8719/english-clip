import { getDb } from '../db/database'
import type { Entry } from '../types'
import { listEntries, updateEntry } from '../db/entries'

/** Media-type buckets shown on home + capture. */
export const DEFAULT_CATEGORIES = [
  '影视剧',
  'YouTube',
  '播客',
  '阅读',
  '其他',
] as const

export type MediaCategory = (typeof DEFAULT_CATEGORIES)[number]

/** Old topic labels → current media buckets. */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  影视娱乐: '影视剧',
  未分类: '其他',
  科技: '其他',
  日常: '其他',
  职场: '其他',
  学术: '其他',
  旅行: '其他',
}

const LEGACY_TOPIC_CATEGORIES = new Set(Object.keys(LEGACY_CATEGORY_MAP))

const META_KEY = 'categories'
const LAST_CATEGORY_KEY = 'lastCategory'

const SOURCE_HINT: Record<string, { source: string; detail: string }> = {
  影视剧: { source: '剧名 / 片名', detail: '如：S01E03 · 12:40' },
  YouTube: { source: '频道名', detail: '视频名或时间点（可选）' },
  播客: { source: '节目名', detail: '集数或时间点（可选）' },
  阅读: { source: '书名 / 文章', detail: '章节或页码（可选）' },
  其他: { source: '来源短名', detail: '补充说明（可选）' },
}

export function categoryHints(category: string): { source: string; detail: string } {
  return SOURCE_HINT[category] ?? SOURCE_HINT['其他']
}

export async function listCategories(): Promise<string[]> {
  const db = await getDb()
  const row = await db.get('meta', META_KEY)
  const saved = row?.value

  if (Array.isArray(saved) && saved.every((x) => typeof x === 'string')) {
    const next = scrubCategoryList(saved)
    if (!sameList(saved, next)) {
      return saveCategories(next)
    }
    return next
  }

  return [...DEFAULT_CATEGORIES]
}

export async function saveCategories(categories: string[]): Promise<string[]> {
  const next = scrubCategoryList(categories)
  const db = await getDb()
  await db.put('meta', { key: META_KEY, value: next })
  return next
}

export async function addCategory(name: string): Promise<string[]> {
  const current = await listCategories()
  const trimmed = normalizeCategory(name)
  if (!trimmed) return current
  if (current.includes(trimmed)) return current
  return saveCategories([...current, trimmed])
}

export async function removeCategory(name: string): Promise<string[]> {
  const current = await listCategories()
  if ((DEFAULT_CATEGORIES as readonly string[]).includes(name)) return current
  return saveCategories(current.filter((c) => c !== name))
}

export async function getLastCategory(): Promise<string> {
  const db = await getDb()
  const row = await db.get('meta', LAST_CATEGORY_KEY)
  const value = row?.value
  if (typeof value === 'string' && value.trim()) {
    return normalizeCategory(value)
  }
  return '其他'
}

export async function setLastCategory(name: string): Promise<void> {
  const trimmed = normalizeCategory(name)
  if (!trimmed) return
  const db = await getDb()
  await db.put('meta', { key: LAST_CATEGORY_KEY, value: trimmed })
}

/** Blank / legacy topic labels → media buckets. */
export function normalizeCategory(category?: string): string {
  const t = category?.trim()
  if (!t) return '其他'
  if (LEGACY_CATEGORY_MAP[t]) return LEGACY_CATEGORY_MAP[t]
  return t
}

/** Rewrite stored entry categories that still use legacy labels. */
export async function migrateLegacyEntryCategories(): Promise<number> {
  const entries = await listEntries()
  let changed = 0
  for (const e of entries) {
    const next = normalizeCategory(e.category)
    if (next === (e.category ?? '')) continue
    await updateEntry(e.id, { category: next })
    changed += 1
  }
  return changed
}

/** Short source names used under a media category (for chips + datalist). */
export function listSources(
  entries: Entry[],
  category?: string,
): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    if (category && normalizeCategory(e.category) !== category) continue
    const s = e.source?.trim()
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
}

/** Categories that should appear in home filters. */
export function categoriesForFilter(
  defaults: string[],
  entries: Entry[],
): string[] {
  const fromEntries = entries.map((e) => normalizeCategory(e.category))
  return scrubCategoryList([...defaults, ...fromEntries])
}

function scrubCategoryList(items: string[]): string[] {
  const customs = items
    .map((c) => normalizeCategory(c))
    .filter(
      (c) =>
        c &&
        !LEGACY_TOPIC_CATEGORIES.has(c) &&
        !(DEFAULT_CATEGORIES as readonly string[]).includes(c),
    )
  return uniqueNonEmpty([...(DEFAULT_CATEGORIES as unknown as string[]), ...customs])
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function uniqueNonEmpty(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const t = item.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
