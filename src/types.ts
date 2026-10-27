export type EntryKind = 'word' | 'phrase' | 'sentence'
export type Familiarity = 'new' | 'seen' | 'usable'
export type FrequencyBand = 1 | 2 | 3 | 4 | 5

export interface Enrichment {
  lemmaId?: string
  phonetic?: string
  /** Native speaker audio URL when available */
  audioUrl?: string
  definitions: string[]
  /** Chinese glosses shown on card back */
  definitionsZh?: string[]
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
  /** Media bucket: 影视剧 / YouTube / 播客 / 阅读 / 其他 */
  category?: string
  /** Short source for filters, e.g. show or channel name */
  source?: string
  /** Episode / timestamp — detail view only */
  sourceDetail?: string
  /** A sentence I would say using this item */
  mySentence?: string
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
  audioUrl?: string
  definitions: string[]
  definitionsZh?: string[]
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
