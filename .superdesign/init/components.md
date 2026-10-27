# Shared UI context

React 19 + TypeScript + Vite 8. Custom HTML controls with plain CSS; no UI library, Tailwind or standalone Button/Input primitives. `.primary`, `.chip`, `.ghost`, `.field`, `.panel` are CSS primitives in src/index.css.

EntryCard is shared by daily, stale and recent collections. CaptureModal is the shared create/edit dialog. LibraryView and SettingsView are page-specific.

### src/components/EntryCard.tsx

```tsx
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
          <p className="meta-line">{metaParts.join(' · ')}</p>
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

```

### src/components/CaptureModal.tsx

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Enrichment, Entry, EntryKind } from '../types'
import { detectKind } from '../lib/normalize'
import { enrichText } from '../lib/enrich'
import { frequencyLabel } from '../lib/lexicon'
import {
  addCategory,
  categoryHints,
  getLastCategory,
  listCategories,
  listSources,
  normalizeCategory,
  setLastCategory,
} from '../lib/categories'
import { speakEnglish } from '../lib/speech'

export interface EntryFormInput {
  text: string
  kind: EntryKind
  context?: string
  note?: string
  category?: string
  source?: string
  sourceDetail?: string
  mySentence?: string
  enrichment?: Enrichment
}

interface Props {
  open: boolean
  entry?: Entry | null
  initialText?: string
  entries?: Entry[]
  onClose: () => void
  onSave: (input: EntryFormInput) => Promise<void>
}

export function CaptureModal({
  open,
  entry = null,
  initialText = '',
  entries = [],
  onClose,
  onSave,
}: Props) {
  const editing = Boolean(entry)
  const [text, setText] = useState(initialText)
  const [context, setContext] = useState('')
  const [note, setNote] = useState('')
  const [source, setSource] = useState('')
  const [sourceDetail, setSourceDetail] = useState('')
  const [mySentence, setMySentence] = useState('')
  const [kind, setKind] = useState<EntryKind>('word')
  const [enrichment, setEnrichment] = useState<Enrichment | undefined>()
  const [enriching, setEnriching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('其他')
  const [newCategory, setNewCategory] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [showCustomCat, setShowCustomCat] = useState(false)

  const hints = useMemo(() => categoryHints(category), [category])
  const sourceSuggestions = useMemo(
    () => listSources(entries, category),
    [entries, category],
  )
  const datalistId = 'source-suggestions'

  useEffect(() => {
    if (!open) return
    void listCategories().then(setCategories)
    setNewCategory('')
    setShowCustomCat(false)

    if (entry) {
      setText(entry.text)
      setContext(entry.context ?? '')
      setNote(entry.note ?? '')
      setSource(entry.source ?? '')
      setSourceDetail(entry.sourceDetail ?? '')
      setMySentence(entry.mySentence ?? '')
      setKind(entry.kind)
      setEnrichment(entry.enrichment)
      setCategory(normalizeCategory(entry.category))
      setShowMore(
        Boolean(entry.context || entry.note || entry.mySentence),
      )
      return
    }

    setText(initialText)
    setContext('')
    setNote('')
    setSource('')
    setSourceDetail('')
    setMySentence('')
    setKind(detectKind(initialText || 'word'))
    setEnrichment(undefined)
    setShowMore(false)
    void getLastCategory().then((c) => setCategory(normalizeCategory(c)))
  }, [open, entry, initialText])

  useEffect(() => {
    if (!open || editing) return
    const trimmed = text.trim()
    if (!trimmed) {
      setEnrichment(undefined)
      return
    }
    setKind(detectKind(trimmed))
    const handle = window.setTimeout(() => {
      setEnriching(true)
      void enrichText(trimmed)
        .then((result) => setEnrichment(result))
        .finally(() => setEnriching(false))
    }, 280)
    return () => window.clearTimeout(handle)
  }, [text, open, editing])

  if (!open) return null

  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const cat = normalizeCategory(category)
      await setLastCategory(cat)
      await onSave({
        text: text.trim(),
        kind,
        context: context.trim() || undefined,
        note: note.trim() || undefined,
        category: cat,
        source: source.trim() || undefined,
        sourceDetail: sourceDetail.trim() || undefined,
        mySentence: mySentence.trim() || undefined,
        enrichment,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '编辑' : '记录'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{editing ? '编辑卡片' : '记录'}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            关闭
          </button>
        </header>

        <label className="field">
          <span>词 / 短语 / 句子</span>
          <div className="row">
            <input
              autoFocus={!editing}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例如：look forward to"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  void handleSave()
                }
              }}
            />
            <button
              type="button"
              className="chip"
              disabled={!text.trim()}
              onClick={() => void speakEnglish(text, enrichment?.audioUrl)}
            >
              听发音
            </button>
          </div>
        </label>

        <div className="kind-row tight">
          {(['word', 'phrase', 'sentence'] as EntryKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? 'chip active' : 'chip'}
              onClick={() => setKind(k)}
            >
              {k === 'word' ? '单词' : k === 'phrase' ? '短语' : '句子'}
            </button>
          ))}
        </div>

        <section className="origin-box">
          <div className="origin-title">出处</div>
          <div className="kind-row tight">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={category === c ? 'chip active' : 'chip'}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => setShowCustomCat((v) => !v)}
            >
              +
            </button>
          </div>

          {showCustomCat && (
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="自定义分类"
              />
              <button
                type="button"
                className="chip"
                onClick={() => {
                  const name = newCategory.trim()
                  if (!name) return
                  void addCategory(name).then((list) => {
                    setCategories(list)
                    setCategory(name)
                    setNewCategory('')
                    setShowCustomCat(false)
                  })
                }}
              >
                添加
              </button>
            </div>
          )}

          <label className="field compact">
            <span>来源</span>
            <input
              list={datalistId}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={hints.source}
              autoComplete="off"
            />
            <datalist id={datalistId}>
              {sourceSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label className="field compact">
            <span>详情</span>
            <input
              value={sourceDetail}
              onChange={(e) => setSourceDetail(e.target.value)}
              placeholder={hints.detail}
            />
          </label>
        </section>

        <button
          type="button"
          className="more-toggle"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? '收起更多 ▲' : '语境 / 理解 / 造句 ▼'}
        </button>

        {showMore && (
          <div className="more-block">
            <label className="field compact">
              <span>原句语境</span>
              <textarea
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="看到的那句原文"
              />
            </label>
            <label className="field compact">
              <span>我的理解</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="中文理解 / 备注"
              />
            </label>
            <label className="field compact">
              <span>我会说的话</span>
              <textarea
                rows={2}
                value={mySentence}
                onChange={(e) => setMySentence(e.target.value)}
                placeholder="用这个词写一句你会说的英文"
              />
            </label>
          </div>
        )}

        <section className="enrich-box">
          <div className="enrich-title">
            <span>释义</span>
            {enriching && <span className="muted">查找中…</span>}
          </div>
          {enrichment ? (
            <div className="enrich-body">
              {enrichment.phonetic && <p className="phonetic">{enrichment.phonetic}</p>}
              <p className="meta-line">
                {enrichment.frequencyBand
                  ? `频率：${frequencyLabel(enrichment.frequencyBand)}`
                  : null}
                {enrichment.cefrBand ? ` · CEFR ${enrichment.cefrBand}` : null}
                {enrichment.pos ? ` · ${enrichment.pos}` : null}
              </p>
              {enrichment.definitionsZh?.length ? (
                <p className="zh-def">{enrichment.definitionsZh.join('；')}</p>
              ) : null}
              {enrichment.definitions.slice(0, 2).map((d) => (
                <p key={d} className="def">
                  {d}
                </p>
              ))}
              {enrichment.examples.slice(0, 1).map((ex) => (
                <p key={ex} className="example">
                  e.g. {ex}
                </p>
              ))}
              {editing && (
                <button
                  type="button"
                  className="chip"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    setEnriching(true)
                    void enrichText(text.trim())
                      .then((result) => {
                        if (result) setEnrichment(result)
                      })
                      .finally(() => setEnriching(false))
                  }}
                >
                  重新补全
                </button>
              )}
            </div>
          ) : (
            <p className="muted tiny">输入后自动补全；未命中可联网查一次。</p>
          )}
        </section>

        <button
          type="button"
          className="primary wide"
          disabled={!text.trim() || saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : editing ? '保存修改' : '保存'}
        </button>
      </div>
    </div>
  )
}

```
