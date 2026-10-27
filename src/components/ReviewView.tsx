import { useEffect, useMemo, useState } from 'react'
import type { Entry, Familiarity } from '../types'
import { getStaleEntries } from '../db/entries'
import { normalizeCategory } from '../lib/categories'
import { EntryCard } from './EntryCard'

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
  const entry = useMemo(() => entries.find((item) => item.id === queue[index]), [entries, queue, index])

  useEffect(() => {
    if (queue.length === 0 && index === 0 && entries.length > 0) {
      setQueue(getStaleEntries(entries, entries.length).map((item) => item.id))
    }
  }, [entries, queue.length, index])

  async function mark(familiarity: Familiarity) {
    if (!entry || saving) return
    setSaving(true)
    try {
      await onReview(entry, familiarity)
      setIndex((value) => value + 1)
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
      <p className="brand-mark">A QUIET MOMENT</p>
      <h1>随手复习</h1>
      <p className="lede">先想一想，再点卡片翻看。按自己的感觉标记就好。</p>
    </header>
    {entry ? <section className="review-session">
      <div className="review-progress"><span>第 {index + 1} / {queue.length} 张</span><span>{normalizeCategory(entry.category)}</span></div>
      <EntryCard key={entry.id} entry={entry} onEdit={() => onEdit(entry)} onUpdated={onUpdated} />
      {entry.context && <p className="review-context">记录时的原句：{entry.context}</p>}
      <div className="review-mark" aria-label="标记熟悉程度">
        <button type="button" className="chip" disabled={saving} onClick={() => void mark('new')}>还生疏</button>
        <button type="button" className="chip" disabled={saving} onClick={() => void mark('seen')}>有印象</button>
        <button type="button" className="chip" disabled={saving} onClick={() => void mark('usable')}>能用了</button>
      </div>
      <button type="button" className="ghost review-skip" disabled={saving} onClick={() => setIndex((value) => value + 1)}>先跳过这张 →</button>
    </section> : <div className="panel review-finished">
      <h2>{queue.length ? '这轮翻完了' : '还没有可复习的词句'}</h2>
      <p className="muted">{queue.length ? '想起来时再翻一次就好。' : '先在首页记录几条，复习会从你的本子里取词。'}</p>
      {entries.length > 0 && <button type="button" className="chip" onClick={restart}>再翻一轮</button>}
      <button type="button" className="ghost" onClick={onHome}>回到首页</button>
    </div>}
  </div>
}
