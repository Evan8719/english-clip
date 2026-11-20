import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const source = process.argv[2]
if (!source) throw Error('Usage: node scripts/build-phonetics.mjs path/to/en_US.txt')

const entries = new Map()
for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  const [word, pronunciation] = line.split('\t')
  const key = word.toLowerCase()
  if (!/^[a-z]+(?:['.-][a-z]+)*$/.test(key) || !pronunciation) continue
  const variants = pronunciation.split(/, */).filter(value => /^\/[^/]+\/$/.test(value))
  if (!variants.length) continue
  entries.set(key, [...new Set([...(entries.get(key) || []), ...variants])])
}

// https://dictionary.cambridge.org/us/pronunciation/english/faq
if (!entries.has('faq')) entries.set('faq', ['/ˌefˌeɪˈkjuː/'])

if (entries.size < 100000) throw Error('The pronunciation source is incomplete')
const json = JSON.stringify(Object.fromEntries([...entries].sort().map(([word, variants]) => [word, variants.join(' · ')])))
const archive = gzipSync(json, { level: 9 })
writeFileSync(new URL('../public/phonetics-en-us-v1.json.gz', import.meta.url), archive)
console.log(`Packaged ${entries.size} pronunciations in ${archive.length} bytes`)
