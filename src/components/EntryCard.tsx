import type { Entry, Familiarity } from '../types'
import { frequencyLabel } from '../lib/lexicon'

const FAM_LABEL: Record<Familiarity, string> = {
  new: '生疏',
  seen: '见过',
  usable: '能用',
}

interface Props {
  entry: Entry
  compact?: boolean
  onReview?: (familiarity: Familiarity) => void
  onDelete?: () => void
}

export function EntryCard({ entry, compact, onReview, onDelete }: Props) {
  return (
    <article className={compact ? 'entry-card compact' : 'entry-card'}>
      <div className="entry-top">
        <h3>{entry.text}</h3>
        <span className={`fam fam-${entry.familiarity}`}>{FAM_LABEL[entry.familiarity]}</span>
      </div>
      {entry.enrichment?.phonetic && (
        <p className="phonetic">{entry.enrichment.phonetic}</p>
      )}
      <p className="meta-line">
        {entry.kind === 'word' ? '单词' : entry.kind === 'phrase' ? '短语' : '句子'}
        {entry.enrichment?.frequencyBand
          ? ` · ${frequencyLabel(entry.enrichment.frequencyBand)}`
          : ''}
        {entry.enrichment?.cefrBand ? ` · ${entry.enrichment.cefrBand}` : ''}
      </p>
      {!compact && entry.enrichment?.definitions?.[0] && (
        <p className="def">{entry.enrichment.definitions[0]}</p>
      )}
      {entry.context && <p className="context">「{entry.context}」</p>}
      {entry.note && <p className="note">{entry.note}</p>}

      {onReview && (
        <div className="review-actions">
          {(['new', 'seen', 'usable'] as Familiarity[]).map((f) => (
            <button
              key={f}
              type="button"
              className={entry.familiarity === f ? 'chip active' : 'chip'}
              onClick={() => onReview(f)}
            >
              {FAM_LABEL[f]}
            </button>
          ))}
        </div>
      )}

      {onDelete && (
        <button type="button" className="ghost danger" onClick={onDelete}>
          删除
        </button>
      )}
    </article>
  )
}
