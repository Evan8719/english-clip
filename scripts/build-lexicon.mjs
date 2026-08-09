/**
 * Builds public/lexicon.json from open word lists + local enrichment seed.
 * Sources:
 * - Google 10k English (first20hours/google-10000-english)
 * - Optional CEFR hints from bundled seed
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dataDir = join(root, 'data')
const outFile = join(root, 'public', 'lexicon.json')
const cacheDir = join(dataDir, 'cache')

const WORDLIST_URL =
  'https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english-usa.txt'
const LOCAL_WORDLIST = join(root, 'data', 'wordlist.txt')

mkdirSync(dataDir, { recursive: true })
mkdirSync(cacheDir, { recursive: true })
mkdirSync(join(root, 'public'), { recursive: true })

function bandForRank(rank) {
  if (rank <= 1000) return 1
  if (rank <= 3000) return 2
  if (rank <= 5000) return 3
  if (rank <= 8000) return 4
  return 5
}

function normalize(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'“”‘’([{]+/, '')
    .replace(/[\s"'“”‘’)\]}.,!?;:]+$/, '')
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
  return res.text()
}

function loadSeed() {
  const seedPath = join(dataDir, 'enrichment-seed.json')
  if (!existsSync(seedPath)) return {}
  const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
  const map = {}
  for (const item of raw) {
    map[normalize(item.headword)] = item
  }
  return map
}

async function loadWordlist() {
  if (existsSync(LOCAL_WORDLIST)) {
    console.log('Using bundled data/wordlist.txt')
    return readFileSync(LOCAL_WORDLIST, 'utf8')
  }
  const cachePath = join(cacheDir, 'google-10000-english-usa.txt')
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf8')
  }
  console.log('Downloading Google 10k word list…')
  const text = await fetchText(WORDLIST_URL)
  writeFileSync(cachePath, text)
  writeFileSync(LOCAL_WORDLIST, text)
  return text
}

function readEnrichCache(word) {
  const cachePath = join(cacheDir, `dict-${word}.json`)
  if (!existsSync(cachePath)) return null
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  } catch {
    return null
  }
}

async function maybeEnrichOnline(word, allowNetwork) {
  const cached = readEnrichCache(word)
  if (cached) return cached
  if (!allowNetwork) return null
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) return null
    const data = await res.json()
    const first = data[0]
    if (!first) return null
    const phonetic =
      first.phonetic || first.phonetics?.find((p) => p.text)?.text || undefined
    const definitions = []
    const examples = []
    let pos
    for (const meaning of first.meanings ?? []) {
      if (!pos && meaning.partOfSpeech) pos = meaning.partOfSpeech
      for (const def of meaning.definitions ?? []) {
        if (def.definition && definitions.length < 2) definitions.push(def.definition)
        if (def.example && examples.length < 1) examples.push(def.example)
      }
    }
    const payload = { phonetic, definitions, examples, pos }
    writeFileSync(join(cacheDir, `dict-${word}.json`), JSON.stringify(payload))
    return payload
  } catch {
    return null
  }
}

async function main() {
  const seed = loadSeed()
  const wordlist = await loadWordlist()
  const words = wordlist
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 9000)

  const onlineLimit = Number(process.env.LEXICON_ONLINE_ENRICH || 0)
  const lemmas = []

  for (let i = 0; i < words.length; i++) {
    const headword = words[i]
    const rank = i + 1
    const fromSeed = seed[headword]
    let phonetic = fromSeed?.phonetic
    let definitions = fromSeed?.definitions ?? []
    let examples = fromSeed?.examples ?? []
    let cefrBand = fromSeed?.cefrBand
    let pos = fromSeed?.pos

    if (definitions.length === 0) {
      const hadCache = Boolean(readEnrichCache(headword))
      const allowNetwork = rank <= onlineLimit
      const online = await maybeEnrichOnline(headword, allowNetwork)
      if (online) {
        phonetic = phonetic || online.phonetic
        definitions = online.definitions ?? []
        examples = online.examples ?? []
        pos = pos || online.pos
      }
      if (allowNetwork && !hadCache) {
        if (rank % 50 === 0) console.log(`Online enrich ${rank}/${onlineLimit}`)
        await new Promise((r) => setTimeout(r, 80))
      }
    }

    lemmas.push({
      id: `g10k_${rank}`,
      headword,
      phonetic,
      definitions,
      examples,
      frequencyBand: bandForRank(rank),
      cefrBand,
      pos,
    })
  }

  // Add seeded phrases not in the 10k list
  for (const [key, item] of Object.entries(seed)) {
    if (lemmas.some((l) => l.headword === key)) continue
    lemmas.push({
      id: `seed_${key}`,
      headword: key,
      phonetic: item.phonetic,
      definitions: item.definitions ?? [],
      examples: item.examples ?? [],
      frequencyBand: item.frequencyBand ?? 3,
      cefrBand: item.cefrBand,
      pos: item.pos,
    })
  }

  const pack = {
    version: 1,
    generatedAt: new Date().toISOString(),
    lemmas,
  }

  writeFileSync(outFile, JSON.stringify(pack))
  const mb = (Buffer.byteLength(JSON.stringify(pack)) / (1024 * 1024)).toFixed(2)
  console.log(`Wrote ${lemmas.length} lemmas → ${outFile} (${mb} MB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
