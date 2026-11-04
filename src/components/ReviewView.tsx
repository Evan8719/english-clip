import { useEffect, useMemo, useRef, useState } from 'react'
import type { Entry, Familiarity } from '../types'
import { getStaleEntries } from '../db/entries'
import { normalizeCategory } from '../lib/categories'
import { EntryCard } from './EntryCard'
import { NavIcon } from './NavIcon'

interface Props {
  entries: Entry[]
  onEdit: (entry: Entry) => void
  onUpdated: () => void
  onReview: (entry: Entry, familiarity: Familiarity) => Promise<void>
  onHome: () => void
}

export function ReviewView({ entries, onEdit, onUpdated, onReview, onHome }: Props) {
  const [queue, setQueue] = useState(() => getStaleEntries(entries, entries.length).map((entry) => entry.id))
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const touch = useRef<{ x: number; y: number } | null>(null)
  const entry = useMemo(() => entries.find((item) => item.id === queue[index]), [entries, queue, index])

  useEffect(() => {
    if (queue.length === 0 && index === 0 && entries.length > 0) {
      setQueue(getStaleEntries(entries, entries.length).map((item) => item.id))
    }
  }, [entries, queue.length, index])

  async function mark(familiarity: Familiarity) {
    if (!entry || saving) return
    setSaving(true)
    setError('')
    try {
      await onReview(entry, familiarity)
      setIndex((value) => value + 1)
    } catch {
      setError('熟悉程度未能保存，请再试一次。')
    } finally {
      setSaving(false)
    }
  }

  function restart() {
    setQueue(getStaleEntries(entries, entries.length).map((item) => item.id))
    setIndex(0)
  }

  return <div className="page review-page">
    <header className="page-header">
      <h1>随手复习</h1>
      <p className="lede">点按翻面，左右滑动切词。熟悉程度由你来选。</p>
    </header>
    {entry ? <section className="review-session">
      <div className="review-progress"><span>第 {index + 1} / {queue.length} 张</span><span>{normalizeCategory(entry.category)}</span></div>
      <progress className="learning-progress" value={index} max={queue.length} aria-label="本轮复习进度" />
      <div className={`review-deck${entry.kind === 'sentence' || entry.text.length > 70 ? ' is-sentence' : ''}`} onTouchStart={(event) => {
        if ((event.target as Element).closest('.card-actions') || event.touches.length !== 1) { touch.current = null; return }
        touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      }} onTouchEnd={(event) => {
        const start = touch.current; touch.current = null
        if (!start || saving || !event.changedTouches.length) return
        const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y
        if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return
        event.preventDefault()
        setIndex((value) => Math.max(0, Math.min(queue.length - 1, value + (dx < 0 ? 1 : -1))))
      }} onTouchCancel={() => { touch.current = null }}>
        <EntryCard key={entry.id} entry={entry} onEdit={() => onEdit(entry)} onUpdated={onUpdated} />
      </div>
      <div className="review-browse"><button className="ghost" disabled={index === 0 || saving} onClick={() => setIndex((value) => value - 1)}>← 上一张</button><span>滑动不会改变熟悉程度</span><button className="ghost" disabled={index >= queue.length - 1 || saving} onClick={() => setIndex((value) => value + 1)}>下一张 →</button></div>
      <div className="review-mark" aria-label="标记熟悉程度">
        <button type="button" className="chip" aria-label="标记为还生疏" disabled={saving} onClick={() => void mark('new')}><NavIcon name="review" /><span>还生疏</span></button>
        <button type="button" className="chip" aria-label="标记为有印象" disabled={saving} onClick={() => void mark('seen')}><NavIcon name="eye" /><span>有印象</span></button>
        <button type="button" className="chip" aria-label="标记为能用了" disabled={saving} onClick={() => void mark('usable')}><NavIcon name="check" /><span>能用了</span></button>
      </div>
      {entry.context && <details className="review-context"><summary>记录时的原句</summary><p>{entry.context}</p></details>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="ghost review-skip" disabled={saving} onClick={() => setIndex((value) => value + 1)}>先跳过这张 →</button>
    </section> : <div className="panel review-finished">
      <h2>{queue.length ? '这轮翻完了' : '还没有可复习的词句'}</h2>
      <p className="muted">{queue.length ? '想起来时再翻一次就好。' : '先在首页记录几条，复习会从你的本子里取词。'}</p>
      {entries.length > 0 && <button type="button" className="chip" onClick={restart}>再翻一轮</button>}
      <button type="button" className="ghost" onClick={onHome}>回到首页</button>
    </div>}
  </div>
}
