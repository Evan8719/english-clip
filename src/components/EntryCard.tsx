import { EntrySource } from './SourceVisual'
import { NavIcon } from './NavIcon'
import { MaterialSheet } from './MaterialSheet'
import { useEffect, useState } from 'react'
import type { Entry, Familiarity } from '../types'
import { frequencyLabel, getLemma } from '../lib/lexicon'
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
  onOpenOrigin?: () => void
}

export function EntryCard({
  entry,
  compact,
  onReview,
  onDelete,
  onEdit,
  onUpdated,
  onOpenOrigin,
}: Props) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [loadingZh, setLoadingZh] = useState(false)
  const [zh, setZh] = useState<string[]>(entry.enrichment?.definitionsZh ?? [])
  const [editingSentence, setEditingSentence] = useState(false)
  const [sentenceDraft, setSentenceDraft] = useState(entry.mySentence ?? '')
  const [savingSentence, setSavingSentence] = useState(false)
  const [dictionarySound, setDictionarySound] = useState<{ text: string; value?: string }>()
  useEffect(() => { setZh(entry.enrichment?.definitionsZh || []) }, [entry.enrichment?.definitionsZh])
  useEffect(() => {
    if (entry.kind !== 'word' || entry.enrichment?.phonetic) return
    let active = true
    void getLemma(entry.text).then(lemma => {
      if (active) setDictionarySound({ text:entry.text, value:lemma?.phonetic })
    }).catch(() => undefined)
    return () => { active = false }
  }, [entry.kind, entry.text, entry.enrichment?.phonetic])
  const phonetic = entry.kind === 'word' && (entry.enrichment?.phonetic || (dictionarySound?.text === entry.text ? dictionarySound.value : undefined))

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

  return <article className={`flip-card fidelity-entry ${compact ? 'compact' : 'review-entry'}${flipped ? ' is-flipped' : ''}`}>
    <div className="entry-main">
      <button type="button" className="entry-face" onClick={() => void handleFlip()} aria-label={flipped ? '查看英文正面' : '翻转查看中文'} aria-pressed={flipped}>
        {flipped ? <span className="entry-back-content">
          {entry.enrichment?.aiPending ? <span className="muted">正在按原句补充释义…</span> : loadingZh ? <span className="muted">正在查词…</span> : zh.length ? zh.map((line, index) => <span className="zh-def" key={index}>{line}</span>) : <span className="muted">暂无释义，可在编辑中填写。</span>}
          <span className="entry-original" lang="en">{entry.text}</span>
        </span> : <>
          <span lang="en" className={`headword ${entry.kind === 'sentence' ? 'is-sentence' : ''}`}>{entry.text}</span>
          {phonetic && <span className="phonetic">{phonetic}</span>}
        </>}
      </button>
      <button className="entry-pronunciation fidelity-icon" aria-label={`朗读 ${entry.text}`} onClick={() => void speakEnglish(entry.text, entry.enrichment?.audioUrl)}><NavIcon name="volume" /></button>
    </div>
    {flipped && <div className="entry-details">
        {compact && entry.context && <span className="entry-original">{entry.context}</span>}
        {entry.note && <span className="entry-original">{entry.note}</span>}
        {entry.mySentence && <span className="entry-original">我会说：{entry.mySentence}</span>}
        <span className="entry-original">{metaParts.join(' · ')}</span>
        {entry.sourceDetail && <span className="entry-original">{entry.sourceDetail}</span>}
        {entry.enrichment?.definitions?.[0] && <span className="entry-original">{entry.enrichment.definitions[0]}</span>}
        {entry.enrichment?.aiNote && <span className="definition-provenance">{entry.enrichment.aiUncertain ? '待确认 · ' : 'AI · '}{entry.enrichment.aiNote}</span>}
    </div>}
    <footer className="entry-footer"><EntrySource entry={entry} onOpen={onOpenOrigin} />{entry.scene && <span className="entry-source-tag" title="使用场景">{entry.scene}</span>}<button className="entry-flip-label" aria-label={flipped ? '翻回英文' : '翻面查看释义'} onClick={() => void handleFlip()}><NavIcon name="note" /><span>{flipped ? '翻回' : '翻面'}</span></button><button className="fidelity-icon entry-more" aria-label="更多词卡操作" onClick={() => setActionsOpen(true)}><NavIcon name="more" /></button></footer>
    {actionsOpen && <MaterialSheet title={entry.text} onClose={() => setActionsOpen(false)}><div className="app-action-menu">{onOpenOrigin && <button onClick={() => { setActionsOpen(false); onOpenOrigin() }}><NavIcon name="book" />回到原文</button>}<button onClick={() => { setActionsOpen(false); setSentenceDraft(entry.mySentence || ''); setEditingSentence(true) }}><NavIcon name="note" />{entry.mySentence ? '修改例句' : '写自己的例句'}</button>{onEdit && <button onClick={() => { setActionsOpen(false); onEdit() }}><NavIcon name="settings" />编辑完整记录</button>}{onDelete && <button onClick={() => { setActionsOpen(false); onDelete() }}><NavIcon name="close" />删除记录</button>}</div></MaterialSheet>}
    {editingSentence && <MaterialSheet title="写自己的例句" onClose={() => setEditingSentence(false)}><div className="sentence-edit"><textarea aria-label="我的例句" rows={4} value={sentenceDraft} onChange={event => setSentenceDraft(event.target.value)} placeholder={`用 ${entry.text} 写一句自己的话`} /><div className="app-sheet-footer"><button className="chip" onClick={() => setEditingSentence(false)}>取消</button><button className="redesign-primary" disabled={savingSentence} onClick={() => void saveSentence()}>保存例句</button></div></div></MaterialSheet>}
    {onReview && <div className="review-actions">{(['new', 'seen', 'usable'] as Familiarity[]).map(value => <button className="chip" key={value} onClick={() => onReview(value)}>{FAM_LABEL[value]}</button>)}</div>}
  </article>
}
