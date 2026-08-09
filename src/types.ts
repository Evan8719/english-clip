export type EntryKind = 'word' | 'phrase' | 'sentence'
export type Familiarity = 'new' | 'seen' | 'usable'
export type FrequencyBand = 1 | 2 | 3 | 4 | 5

export interface Enrichment {
  lemmaId?: string
  phonetic?: string
  definitions: string[]
  examples: string[]
  frequencyBand?: FrequencyBand
  cefrBand?: string
  pos?: string
  provider?: 'local' | 'free-dictionary' | 'manual'
}

export interface Entry {
  id: string
  text: string
  kind: EntryKind
  context?: string
  note?: string
  tags: string[]
  familiarity: Familiarity
  enrichment?: Enrichment
  createdAt: string
  updatedAt: string
  lastReviewedAt?: string
  deletedAt?: string
}

export interface Lemma {
  id: string
  headword: string
  phonetic?: string
  definitions: string[]
  examples: string[]
  frequencyBand: FrequencyBand
  cefrBand?: string
  pos?: string
}

export interface LexiconPack {
  version: number
  generatedAt: string
  lemmas: Lemma[]
}

export type TabId = 'home' | 'library' | 'settings'
