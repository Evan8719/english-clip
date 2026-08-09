import type { Enrichment, FrequencyBand, Lemma } from '../types'
import { createId, normalizeHeadword } from './normalize'
import { cacheLemma, getLemma, lemmaToEnrichment } from './lexicon'

interface FreeDictionaryPhonetic {
  text?: string
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

export async function enrichText(text: string): Promise<Enrichment | undefined> {
  const local = await getLemma(text)
  if (local && (local.definitions.length > 0 || local.phonetic || local.frequencyBand)) {
    return lemmaToEnrichment(local)
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return local ? lemmaToEnrichment(local) : undefined
  }

  const online = await fetchFreeDictionary(text)
  if (!online) {
    return local ? lemmaToEnrichment(local) : undefined
  }

  await cacheLemma(online)
  return lemmaToEnrichment(online)
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
      definitions,
      examples,
      frequencyBand: bandFromOnline(),
      pos,
    }
  } catch {
    return undefined
  }
}
