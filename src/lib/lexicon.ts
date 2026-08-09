import type { FrequencyBand, Lemma, LexiconPack } from '../types'
import { normalizeHeadword } from './normalize'
import { getDb } from '../db/database'

let packPromise: Promise<LexiconPack> | null = null
let lemmaByHeadword: Map<string, Lemma> | null = null
let sortedHeadwords: string[] = []

const FREQUENCY_LABELS: Record<FrequencyBand, string> = {
  1: '非常常用',
  2: '常用',
  3: '较常用',
  4: '不太常用',
  5: '少见',
}

export function frequencyLabel(band?: FrequencyBand): string {
  if (!band) return '未知'
  return FREQUENCY_LABELS[band]
}

async function loadPack(): Promise<LexiconPack> {
  if (!packPromise) {
    packPromise = fetch(`${import.meta.env.BASE_URL}lexicon.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load lexicon: ${res.status}`)
        return (await res.json()) as LexiconPack
      })
      .then((pack) => {
        lemmaByHeadword = new Map(
          pack.lemmas.map((lemma) => [normalizeHeadword(lemma.headword), lemma]),
        )
        sortedHeadwords = [...lemmaByHeadword.keys()].sort()
        return pack
      })
      .catch((err) => {
        packPromise = null
        throw err
      })
  }
  return packPromise
}

export async function ensureLexiconLoaded(): Promise<LexiconPack> {
  return loadPack()
}

export async function getLemma(text: string): Promise<Lemma | undefined> {
  await loadPack()
  const key = normalizeHeadword(text)
  const local = lemmaByHeadword?.get(key)
  if (local) return local

  const db = await getDb()
  return db.get('lemmaCache', key)
}

export async function cacheLemma(lemma: Lemma): Promise<void> {
  const db = await getDb()
  await db.put('lemmaCache', {
    ...lemma,
    id: normalizeHeadword(lemma.headword),
    headword: normalizeHeadword(lemma.headword),
  })
}

export async function searchLemmas(query: string, limit = 30): Promise<Lemma[]> {
  await loadPack()
  const q = normalizeHeadword(query)
  if (!q || !lemmaByHeadword) return []

  const startsWith: Lemma[] = []
  const includes: Lemma[] = []

  for (const headword of sortedHeadwords) {
    if (headword.startsWith(q)) {
      const lemma = lemmaByHeadword.get(headword)
      if (lemma) startsWith.push(lemma)
    } else if (headword.includes(q)) {
      const lemma = lemmaByHeadword.get(headword)
      if (lemma) includes.push(lemma)
    }
    if (startsWith.length >= limit) break
  }

  return [...startsWith, ...includes].slice(0, limit)
}

export function lemmaToEnrichment(lemma: Lemma) {
  return {
    lemmaId: lemma.id,
    phonetic: lemma.phonetic,
    definitions: lemma.definitions,
    examples: lemma.examples,
    frequencyBand: lemma.frequencyBand,
    cefrBand: lemma.cefrBand,
    pos: lemma.pos,
    provider: 'local' as const,
  }
}
