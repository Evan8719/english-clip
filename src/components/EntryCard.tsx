import { useState } from 'react'
import type { Entry, Familiarity } from '../types'
import { frequencyLabel } from '../lib/lexicon'
import { ensureZhEnrichment } from '../lib/enrich'
import { updateEntry } from '../db/entries'
import { speakEnglish } from '../lib/speech'
import { normalizeCategory } from '../lib/categories'

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
  onEdit?: () => void
  onUpdated?: () => void
}

export function EntryCard({
  entry,
  compact,
  onReview,
  onDelete,
  onEdit,
  onUpdated,
}: Props) {
  const [flipped, setFlipped] = useState(false)
  const [loadingZh, setLoadingZh] = useState(false)
  const [zh, setZh] = useState<string[]>(entry.enrichment?.definitionsZh ?? [])
  const [editingSentence, setEditingSentence] = useState(false)
  const [sentenceDraft, setSentenceDraft] = useState(entry.mySentence ?? '')
  const [savingSentence, setSavingSentence] = useState(false)

  const kindLabel =
    entry.kind === 'word' ? '单词' : entry.kind === 'phrase' ? '短语' : '句子'
  const category = normalizeCategory(entry.category)
  const metaParts = [
    kindLabel,
    category,
    entry.source?.trim() || null,
    entry.enrichment?.frequencyBand
      ? frequencyLabel(entry.enrichment.frequencyBand)
      : null,
    FAM_LABEL[entry.familiarity],
  ].filter(Boolean)

  async function handleFlip() {
    const next = !flipped
    setFlipped(next)
    if (!next) return
    if (zh.length > 0) return

    setLoadingZh(true)
    try {
      const enriched = await ensureZhEnrichment(entry.text, entry.enrichment)
      const nextZh = enriched?.definitionsZh ?? []
      setZh(nextZh)
      if (nextZh.length && enriched) {
        await updateEntry(entry.id, { enrichment: enriched })
        onUpdated?.()
      }
    } finally {
      setLoadingZh(false)
    }
  }

  async function saveSentence() {
    setSavingSentence(true)
    try {
      await updateEntry(entry.id, {
        mySentence: sentenceDraft.trim() || undefined,
      })
      setEditingSentence(false)
      onUpdated?.()
    } finally {
      setSavingSentence(false)
    }
  }

  return (
    <article className={compact ? 'flip-card compact' : 'flip-card'}>
      <button
        type="button"
        className={flipped ? 'flip-inner flipped' : 'flip-inner'}
        onClick={() => void handleFlip()}
        aria-label={flipped ? '查看英文正面' : '翻转查看中文'}
      >
        <div className="flip-face flip-front">
          <p className="headword">{entry.text}</p>
          {entry.enrichment?.phonetic && (
            <p className="phonetic">{entry.enrichment.phonetic}</p>
          )}
          {compact ? (
            entry.context && <p className="card-context-preview">{entry.context}</p>
          ) : (
            <p className="meta-line">{metaParts.join(' · ')}</p>
          )}
          <p className="flip-hint">点按翻转</p>
        </div>

        <div className="flip-face flip-back">
          <p className="headword headword-back">{entry.text}</p>
          {loadingZh && <p className="muted">正在获取释义…</p>}
          {!loadingZh && zh.length > 0 && (
            <div className="zh-defs">
              {zh.map((line) => (
                <p key={line} className="zh-def">
                  {line}
                </p>
              ))}
            </div>
          )}
          {!loadingZh && zh.length === 0 && (
            <p className="muted">暂无中文释义。可填写「我的理解」。</p>
          )}
          {entry.sourceDetail && (
            <p className="note">详情：{entry.sourceDetail}</p>
          )}
          {entry.mySentence && (
            <p className="note">我会说：{entry.mySentence}</p>
          )}
          {entry.note && <p className="note">理解：{entry.note}</p>}
          {entry.enrichment?.definitions?.[0] && (
            <p className="example">EN: {entry.enrichment.definitions[0]}</p>
          )}
          <p className="flip-hint">再点翻回</p>
        </div>
      </button>

      {compact && (
        <div className="card-side-meta" title={[category, entry.source, entry.sourceDetail].filter(Boolean).join(' · ')}>
          <span className="card-side-source">{category}{entry.source ? ` · ${entry.source}` : ''}</span>
          {entry.sourceDetail && <span className="card-side-detail">{entry.sourceDetail}</span>}
          <span className="card-side-state">{kindLabel} · {FAM_LABEL[entry.familiarity]}</span>
        </div>
      )}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <div className="row card-action-row">
          <button
            type="button"
            className="chip"
            onClick={() => void speakEnglish(entry.text, entry.enrichment?.audioUrl)}
          >
            听发音
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              setSentenceDraft(entry.mySentence ?? '')
              setEditingSentence((v) => !v)
            }}
          >
            {entry.mySentence ? '改造句' : '造句'}
          </button>
          {onEdit && (
            <button type="button" className="chip" onClick={onEdit}>
              编辑
            </button>
          )}
        </div>

        {editingSentence && (
          <div className="sentence-edit">
            <textarea
              rows={2}
              value={sentenceDraft}
              onChange={(e) => setSentenceDraft(e.target.value)}
              placeholder={`用 “${entry.text}” 写一句你会说的话`}
            />
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={savingSentence}
                onClick={() => void saveSentence()}
              >
                保存句子
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditingSentence(false)}
              >
                取消
              </button>
            </div>
          </div>
        )}

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
      </div>
    </article>
  )
}
