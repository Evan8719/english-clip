import { gunzipSync, strFromU8 } from 'fflate'
import { getLemma } from './lexicon'
import { normalizeHeadword } from './normalize'

let packPromise: Promise<Record<string, string>> | undefined

function loadPronunciationPack() {
  packPromise ??= fetch(`${import.meta.env.BASE_URL}phonetics-en-us-v1.json.gz`)
    .then(async response => {
      if (!response.ok) throw Error(`Pronunciation pack request failed: ${response.status}`)
      const data = new Uint8Array(await response.arrayBuffer())
      return JSON.parse(strFromU8(gunzipSync(data))) as Record<string, string>
    })
    .catch((error: unknown) => {
      packPromise = undefined
      throw error
    })
  return packPromise
}

export async function lookupWordPhonetic(text: string): Promise<string | undefined> {
  const word = normalizeHeadword(text).replaceAll('’', "'")
  if (!/^[a-z]+(?:['.-][a-z]+)*$/.test(word)) return undefined
  const existing = (await getLemma(word).catch(() => undefined))?.phonetic?.trim()
  if (existing) return existing
  const pack = await loadPronunciationPack()
  return Object.hasOwn(pack, word) ? pack[word] : undefined
}
