import { useEffect, useState } from 'react'
import type { Enrichment, EntryKind } from '../types'
import { detectKind } from '../lib/normalize'
import { enrichText } from '../lib/enrich'
import { frequencyLabel } from '../lib/lexicon'

interface Props {
  open: boolean
  initialText?: string
  onClose: () => void
  onSave: (input: {
    text: string
    kind: EntryKind
    context?: string
    note?: string
    enrichment?: Enrichment
  }) => Promise<void>
}

export function CaptureModal({ open, initialText = '', onClose, onSave }: Props) {
  const [text, setText] = useState(initialText)
  const [context, setContext] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<EntryKind>('word')
  const [enrichment, setEnrichment] = useState<Enrichment | undefined>()
  const [enriching, setEnriching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setText(initialText)
    setContext('')
    setNote('')
    setKind(detectKind(initialText || 'word'))
    setEnrichment(undefined)
  }, [open, initialText])

  useEffect(() => {
    if (!open) return
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
  }, [text, open])

  if (!open) return null

  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        text: text.trim(),
        kind,
        context: context.trim() || undefined,
        note: note.trim() || undefined,
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
        aria-label="记录"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>记录</h2>
          <button type="button" className="ghost" onClick={onClose}>
            关闭
          </button>
        </header>

        <label className="field">
          <span>词 / 短语 / 句子</span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例如：look forward to"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void handleSave()
              }
            }}
          />
        </label>

        <div className="kind-row">
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

        <label className="field">
          <span>原句语境（可选）</span>
          <textarea
            rows={2}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="你在哪看到的那句原文"
          />
        </label>

        <label className="field">
          <span>我的理解（可选）</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="我会怎么用 / 我的理解"
          />
        </label>

        <section className="enrich-box">
          <div className="enrich-title">
            <span>自动补全</span>
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
            </div>
          ) : (
            <p className="muted">输入后将尝试本地词库补全；未命中时可联网补一次并缓存。</p>
          )}
        </section>

        <button
          type="button"
          className="primary wide"
          disabled={!text.trim() || saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
