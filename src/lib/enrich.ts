import type { Enrichment, FrequencyBand, Lemma } from '../types'
import { createId, normalizeHeadword } from './normalize'
import { cacheLemma, getLemma, lemmaToEnrichment } from './lexicon'
import { fetchZhOnline, lookupZhGloss, splitZhGloss } from './zhGloss'

interface FreeDictionaryPhonetic {
  text?: string
  audio?: string
}

interface FreeDictionaryMeaning {
  partOfSpeech?: string
  definitions?: Array<{ definition?: string; example?: string }>
}

interface FreeDictionaryEntry {
  word?: string
  phonetic?: string
  phonetics?: FreeDictionaryPhonetic[]
  meanings?: FreeDictionaryMeaning[]
}

function bandFromOnline(): FrequencyBand {
  return 4
}

async function attachZh(text: string, enrichment: Enrichment): Promise<Enrichment> {
  if (enrichment.definitionsZh?.length) return enrichment

  const localZh = await lookupZhGloss(text)
  if (localZh) {
    return { ...enrichment, definitionsZh: splitZhGloss(localZh) }
  }

  const onlineZh = await fetchZhOnline(text)
  if (onlineZh) {
    return { ...enrichment, definitionsZh: splitZhGloss(onlineZh) }
  }

  return enrichment
}

export async function enrichText(text: string): Promise<Enrichment | undefined> {
  const local = await getLemma(text)
  if (local && (local.definitions.length > 0 || local.phonetic || local.frequencyBand || local.definitionsZh?.length)) {
    return attachZh(text, lemmaToEnrichment(local))
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (!local) {
      const onlyZh = await lookupZhGloss(text)
      if (!onlyZh) return undefined
      return {
        definitions: [],
        definitionsZh: splitZhGloss(onlyZh),
        examples: [],
        provider: 'local',
      }
    }
    return attachZh(text, lemmaToEnrichment(local))
  }

  const online = await fetchFreeDictionary(text)
  if (!online) {
    if (local) return attachZh(text, lemmaToEnrichment(local))
    const onlyZh = await attachZh(text, { definitions: [], examples: [], provider: 'manual' })
    return onlyZh.definitionsZh?.length ? onlyZh : undefined
  }

  await cacheLemma(online)
  return attachZh(text, lemmaToEnrichment(online))
}

/** Resolve Chinese gloss for an existing entry (e.g. on card flip). */
export async function ensureZhEnrichment(
  text: string,
  enrichment?: Enrichment,
): Promise<Enrichment | undefined> {
  const base =
    enrichment ??
    ({
      definitions: [],
      examples: [],
      provider: 'manual' as const,
    } satisfies Enrichment)

  return attachZh(text, base)
}

async function fetchFreeDictionary(text: string): Promise<Lemma | undefined> {
  const word = normalizeHeadword(text)
  if (!word || /\s/.test(word)) return undefined

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as FreeDictionaryEntry[]
    const first = data[0]
    if (!first) return undefined

    const phonetic =
      first.phonetic ||
      first.phonetics?.find((p) => p.text)?.text ||
      undefined

    const audioUrl =
      first.phonetics?.find((p) => p.audio && /us/i.test(p.audio))?.audio ||
      first.phonetics?.find((p) => p.audio)?.audio ||
      undefined

    const definitions: string[] = []
    const examples: string[] = []
    let pos: string | undefined

    for (const meaning of first.meanings ?? []) {
      if (!pos && meaning.partOfSpeech) pos = meaning.partOfSpeech
      for (const def of meaning.definitions ?? []) {
        if (def.definition && definitions.length < 3) {
          definitions.push(def.definition)
        }
        if (def.example && examples.length < 2) {
          examples.push(def.example)
        }
      }
    }

    return {
      id: createId(),
      headword: word,
      phonetic,
      audioUrl,
      definitions,
      examples,
      frequencyBand: bandFromOnline(),
      pos,
    }
  } catch {
    return undefined
  }
}
