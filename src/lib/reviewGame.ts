import type { Entry } from '../types'

export interface ReviewQuestion { id: string; entryId: string; kind: 'meaning' | 'context' | 'listen' | 'recall'; prompt: string; context: string; english: string; answer: string; choices: string[]; explanation: string }
const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
function shuffle<T>(items: T[], random: () => number): T[] { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]] } return result }
export function buildReviewGame(entries: Entry[], limit = 5, random = Math.random): ReviewQuestion[] {
  const unique = new Map<string, Entry>()
  for (const entry of entries) if (!entry.deletedAt && entry.text.trim() && !unique.has(normalized(entry.text))) unique.set(normalized(entry.text), entry)
  const pool = [...unique.values()], targets = shuffle(pool, random).slice(0, limit)
  return targets.map((entry, index) => {
    const meanings = entry.enrichment?.aiUncertain ? [] : (entry.enrichment?.definitionsZh || []).filter(Boolean)
    const meaning = meanings[0] || '', alternatives = shuffle(pool.filter(other => other.id !== entry.id), random)
    const terms = alternatives.map(other => other.text.trim()).filter(text => normalized(text) !== normalized(entry.text))
    const glosses = [...new Set(alternatives.flatMap(other => other.enrichment?.aiUncertain ? [] : (other.enrichment?.definitionsZh || []).slice(0,1)).filter(text => text.trim() && !meanings.some(value => normalized(value) === normalized(text))))]
    const base = { id: entry.id + ':' + index, entryId: entry.id, english: entry.text.trim(), context: entry.context || '', explanation: meaning || entry.note || entry.text.trim() }
    const escaped = entry.text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i')
    if (index % 3 === 1 && terms.length >= 2 && entry.context && entry.context.length > entry.text.length + 10 && pattern.test(entry.context)) return { ...base, kind: 'context', prompt: '填回你记录的原表达', context: entry.context.replace(pattern, '_____'), answer: entry.text.trim(), choices: shuffle([entry.text.trim(), ...terms.slice(0,2)], random) }
    if (index % 3 === 2 && terms.length >= 2) return { ...base, kind: 'listen', prompt: '听音，选出对应表达', answer: entry.text.trim(), choices: shuffle([entry.text.trim(), ...terms.slice(0,2)], random) }
    if (meaning && glosses.length >= 2) return { ...base, kind: 'meaning', prompt: '选择你记录的释义', answer: meaning, choices: shuffle([meaning, ...glosses.slice(0,2)], random) }
    return { ...base, kind: 'recall', prompt: '想一想这条表达的意思', answer: meaning || entry.text.trim(), choices: [] }
  })
}
