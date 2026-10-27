import { normalizeHeadword } from './normalize'

type ZhMap = Record<string, string>

let mapPromise: Promise<ZhMap> | null = null

async function loadZhMap(): Promise<ZhMap> {
  if (!mapPromise) {
    mapPromise = fetch(`${import.meta.env.BASE_URL}zh-gloss.json`)
      .then(async (res) => {
        if (!res.ok) return {}
        return (await res.json()) as ZhMap
      })
      .catch(() => ({}))
  }
  return mapPromise
}

export async function lookupZhGloss(text: string): Promise<string | undefined> {
  const map = await loadZhMap()
  const key = normalizeHeadword(text)
  if (map[key]) return map[key]

  // Try first token for simple inflections later; keep strict for now.
  return undefined
}

/** Free MyMemory API — best-effort Chinese gloss when offline pack misses. */
export async function fetchZhOnline(text: string): Promise<string | undefined> {
  const q = normalizeHeadword(text)
  if (!q) return undefined
  if (typeof navigator !== 'undefined' && !navigator.onLine) return undefined

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
    }
    const translated = data.responseData?.translatedText?.trim()
    if (!translated) return undefined
    // Ignore useless echo translations
    if (translated.toLowerCase() === q.toLowerCase()) return undefined
    return translated
  } catch {
    return undefined
  }
}

export function splitZhGloss(gloss: string): string[] {
  return gloss
    .split(/[;；|]/)
    .flatMap((part) => part.split('/'))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
}
