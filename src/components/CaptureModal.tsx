import { parseTags } from '../lib/tags'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { VoiceInput } from './VoiceInput'
import { speakEnglish } from '../lib/speech'
import { explainWithAi, getAiStatus } from '../lib/media'

export interface EntryFormInput {
  tags: string[]
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
  initialContext?: string
  initialCategory?: string
  initialSource?: string
  initialSourceDetail?: string
  entries?: Entry[]
  onClose: () => void
  onSave: (input: EntryFormInput) => Promise<void>
}

export function CaptureModal({
  open,
  entry = null,
  initialText = '',
  initialContext = '',
  initialCategory = '',
  initialSource = '',
  initialSourceDetail = '',
  entries = [],
  onClose,
  onSave,
}: Props) {
  useEffect(() => {
    if (!open) return
    const view = window.visualViewport
    const resize = () => { document.documentElement.style.setProperty('--capture-height', `${view?.height || window.innerHeight}px`); document.documentElement.style.setProperty('--capture-top', `${view?.offsetTop || 0}px`) }
    resize(); view?.addEventListener('resize', resize); view?.addEventListener('scroll', resize)
    return () => { view?.removeEventListener('resize', resize); view?.removeEventListener('scroll', resize) }
  }, [open])
  const editing = Boolean(entry)
  const [text, setText] = useState(initialText)
  const [context, setContext] = useState('')
  const [tagText, setTagText] = useState('')
  const [note, setNote] = useState('')
  const [source, setSource] = useState('')
  const [sourceDetail, setSourceDetail] = useState('')
  const [mySentence, setMySentence] = useState('')
  const [kind, setKind] = useState<EntryKind>('word')
  const [enrichment, setEnrichment] = useState<Enrichment | undefined>()
  const [enriching, setEnriching] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('其他')
  const [newCategory, setNewCategory] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [showCustomCat, setShowCustomCat] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('ec.capture-ai') !== 'off')
  const [aiSignature, setAiSignature] = useState('')
  const [aiReady, setAiReady] = useState(false), [aiBusy, setAiBusy] = useState(false), [aiError, setAiError] = useState(''), [aiRevision, setAiRevision] = useState(0), [manualGloss, setManualGloss] = useState(false), [editGloss, setEditGloss] = useState(false)
  const activeText = useRef('')
  const initializingText = useRef<string | null>(null)
  useEffect(() => { if (!open) return; let cancelled = false; void getAiStatus().then(status => { if (!cancelled) setAiReady(status.assistantConfigured) }).catch(() => { if (!cancelled) setAiReady(false) }); return () => { cancelled = true } }, [open])

  const hints = useMemo(() => categoryHints(category), [category])
  const sourceSuggestions = useMemo(
    () => listSources(entries, category),
    [entries, category],
  )
  const datalistId = 'source-suggestions'

  useEffect(() => {
    if (!open) return
    void listCategories().then(setCategories)
    setNewCategory(''); setTagText((entry?.tags || []).join('，'))
    setShowCustomCat(false)
    setAiRevision(0); setAiSignature(''); setManualGloss(false); setEditGloss(false); setAiError(''); setSaveError(''); activeText.current = entry?.text.trim() || initialText.trim(); initializingText.current = activeText.current

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
    setContext(initialContext)
    setNote('')
    setSource(initialSource)
    setSourceDetail(initialSourceDetail)
    setMySentence('')
    setKind(detectKind(initialText || 'word'))
    setEnrichment(undefined)
    setShowMore(Boolean(initialContext))
    if (initialCategory) setCategory(normalizeCategory(initialCategory))
    else void getLastCategory().then((c) => setCategory(normalizeCategory(c)))
  }, [open, entry, initialText, initialContext, initialCategory, initialSource, initialSourceDetail])

  useEffect(() => {
    if (!open) return
    const trimmed = text.trim()
    if (initializingText.current !== null) { if (trimmed !== initializingText.current) return; initializingText.current = null }
    if (trimmed !== activeText.current) { activeText.current = trimmed; setEnrichment(undefined); setManualGloss(false) }
    if (editing) return
    if (!trimmed) {
      setEnriching(false)
      setEnrichment(undefined)
      return
    }
    setKind(detectKind(trimmed))
    let cancelled = false
    const handle = window.setTimeout(() => {
      setEnriching(true)
      void enrichText(trimmed)
        .then((result) => { if (!cancelled) setEnrichment(current => current?.provider?.startsWith('ai-') || current?.provider === 'manual' ? current : result) })
        .catch(() => undefined)
        .finally(() => { if (!cancelled) setEnriching(false) })
    }, 280)
    return () => { cancelled = true; window.clearTimeout(handle) }
  }, [text, open, editing])

  useEffect(() => {
    if (!open || !aiReady || !aiEnabled || !text.trim() || manualGloss || (editing && aiRevision === 0)) { setAiBusy(false); return }
    const controller = new AbortController(); let cancelled = false
    setAiError('')
    const timer = window.setTimeout(() => {
      setAiBusy(true)
      void explainWithAi(text.trim(), context, source, controller.signal).then(result => {
        if (!cancelled) { setAiSignature(JSON.stringify([text.trim(), context, source])); setEnrichment(current => ({ ...current, definitions: [], examples: [], definitionsZh: result.definitionsZh, provider: result.provider === 'gemini' ? 'ai-gemini' : 'ai-deepseek', aiNote: result.note, aiUncertain: result.uncertain, aiPending: false })) }
      }).catch((error: Error) => { if (!cancelled && error.name !== 'AbortError') setAiError(error.message) }).finally(() => { if (!cancelled) setAiBusy(false) })
    }, 900)
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort() }
  }, [open, aiReady, aiEnabled, text, context, source, manualGloss, editing, aiRevision])

  if (!open) return null

  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const cat = normalizeCategory(category)
      await setLastCategory(cat)
      await onSave({
        text: text.trim(),
        tags: parseTags(tagText),
        kind,
        context: context.trim() || undefined,
        note: note.trim() || undefined,
        category: cat,
        source: source.trim() || undefined,
        sourceDetail: sourceDetail.trim() || undefined,
        mySentence: mySentence.trim() || undefined,
        enrichment: aiEnabled && aiReady && !manualGloss && (!editing || aiRevision > 0) && aiSignature !== JSON.stringify([text.trim(), context, source]) ? { ...(enrichment || { definitions: [], examples: [] }), aiPending: true } : enrichment,
      })
      onClose()
    } catch (error) { setSaveError((error as Error).message || '保存失败，请重试') } finally {
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

        <VoiceInput onText={(value) => setText((old) => old ? old + ' ' + value : value)} />
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

        <section className="entry-tag-editor" aria-label="记录标签">
          <label className="field"><span>标签</span><input aria-label="自定义标签" autoComplete="off" value={tagText} onChange={e => setTagText(e.target.value)} placeholder="自定义标签，用逗号分隔" /></label>
          <div className="entry-tag-list">{parseTags(tagText).map(tag => <button type="button" className="chip active" key={tag} aria-label={`移除标签 ${tag}`} onClick={() => setTagText(parseTags(tagText).filter(t => t !== tag).join('，'))}>#{tag} ×</button>)}</div>
          <div className="entry-tag-list">{[...new Set(entries.flatMap(item => item.tags || []))].filter(tag => !parseTags(tagText).includes(tag)).slice(0, 12).map(tag => <button type="button" className="chip" key={tag} onClick={() => setTagText([...parseTags(tagText), tag].join('，'))}>+ {tag}</button>)}</div>
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
            <span>{enrichment?.provider?.startsWith('ai-') ? 'AI · 结合原句' : '词典参考'}</span>
            {aiBusy ? <span className="muted">AI 释义中…</span> : enriching && <span className="muted">查找中…</span>}
          </div>
          <div className="capture-ai-tools"><label><input type="checkbox" checked={aiEnabled} onChange={event => { setAiEnabled(event.target.checked); localStorage.setItem('ec.capture-ai', event.target.checked ? 'on' : 'off') }} />AI 释义</label><button type="button" className="redesign-text-button" disabled={!text.trim() || !aiReady || aiBusy} onClick={() => { setManualGloss(false); setAiEnabled(true); setAiRevision(value => value + 1) }}>按原句重释</button><button type="button" className="redesign-text-button" onClick={() => { setEditGloss(value => !value); setManualGloss(true) }}>修改释义</button></div>
          {aiEnabled && !aiReady && <p className="muted tiny">在设置中配置 AI 后，可自动按原句释义。</p>}
          {aiError && <p className="muted tiny" role="status">{aiError}；可先保存，再重试。</p>}
          {editGloss && <textarea aria-label="修改中文释义" rows={3} value={enrichment?.definitionsZh?.join('\n') || ''} onChange={event => { setManualGloss(true); const definitionsZh = event.target.value.split('\n'); setEnrichment(current => ({ ...current, definitions: [], examples: [], definitionsZh, provider: 'manual', aiPending: false, aiNote: undefined, aiUncertain: false })) }} />}
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
              {enrichment.aiNote && <p className="muted tiny">{enrichment.aiUncertain ? '待确认：' : ''}{enrichment.aiNote}</p>}
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

        {saveError && <p role="alert">{saveError}</p>}
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
