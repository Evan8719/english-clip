import { useMemo, useState } from 'react'
import type { Entry, EntryKind } from '../types'
import { categoriesForFilter, listSources, normalizeCategory } from '../lib/categories'
import { EntryCard } from './EntryCard'

interface Props {
  entries: Entry[]
  categories: string[]
  onEdit: (entry: Entry) => void
  onUpdated: () => void
  onDelete: (entry: Entry) => void
  lexiconStatus: string
}

export function HomeView({ entries, categories, onEdit, onUpdated, onDelete, lexiconStatus }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [source, setSource] = useState('全部来源')
  const [kind, setKind] = useState<EntryKind | 'all'>('all')
  const [order, setOrder] = useState<'recent' | 'alphabetical'>('recent')
  const [adjustOpen, setAdjustOpen] = useState(false)

  const categoriesShown = useMemo(() => categoriesForFilter(categories, entries), [categories, entries])
  const sources = useMemo(() => category === '全部' ? [] : listSources(entries, category), [entries, category])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const result = entries.filter((entry) => {
      if (category !== '全部' && normalizeCategory(entry.category) !== category) return false
      if (source !== '全部来源' && entry.source !== source) return false
      if (kind !== 'all' && entry.kind !== kind) return false
      if (!term) return true
      return [entry.text, entry.context, entry.note, entry.source, entry.sourceDetail, entry.mySentence,
        ...(entry.enrichment?.definitionsZh ?? []), ...(entry.enrichment?.definitions ?? [])]
        .some((value) => value?.toLocaleLowerCase().includes(term))
    })
    return order === 'alphabetical'
      ? result.sort((a, b) => a.text.localeCompare(b.text, 'en'))
      : result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [entries, query, category, source, kind, order])

  return (
    <div className="page">
      <header className="page-header brand home-header">
        <p className="brand-mark">English Clip</p>
        <h1>英语剪贴本</h1>
        <p className="lede">记下有用的词，想起来再翻。无催促。</p>
      </header>

      <div className="home-controls">
        <div className="home-control-main">
          <input className="home-search" type="search" aria-label="搜索已记录的词句" placeholder="搜索词句、来源或笔记" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className={adjustOpen ? 'chip active' : 'chip'} aria-expanded={adjustOpen} aria-controls="home-adjust" onClick={() => setAdjustOpen((value) => !value)}>调整</button>
        </div>
        <div className="home-category-scroll" aria-label="按来源类型筛选">
          <button type="button" className={category === '全部' ? 'chip active' : 'chip'} onClick={() => { setCategory('全部'); setSource('全部来源') }}>全部</button>
          {categoriesShown.map((item) => <button key={item} type="button" className={category === item ? 'chip active' : 'chip'} onClick={() => { setCategory(item); setSource('全部来源') }}>{item}</button>)}
        </div>
        {adjustOpen && <div id="home-adjust" className="home-adjust">
          <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as EntryKind | 'all')}>
            <option value="all">全部词句</option><option value="word">单词</option><option value="phrase">短语</option><option value="sentence">句子</option>
          </select></label>
          <label>排序<select value={order} onChange={(event) => setOrder(event.target.value as 'recent' | 'alphabetical')}>
            <option value="recent">最近记录</option><option value="alphabetical">字母顺序</option>
          </select></label>
          {sources.length > 0 && <label className="home-source-select">具体来源<select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="全部来源">全部来源</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>}
        </div>}
      </div>

      <div className="home-list-head">
        <div><h2>我的词条</h2><p className="muted tiny">{filtered.length} 条 · {order === 'recent' ? '最近记录在前' : '按字母排列'} · 点卡片翻看释义</p></div>
        {lexiconStatus && <span className="muted tiny">{lexiconStatus}</span>}
      </div>
      {filtered.length === 0 ? <div className="home-empty panel">
        <p>{entries.length ? '没有找到符合条件的词句。' : '本子里还没有词句。看到想记的表达，就点底栏的「＋」。'}</p>
        {entries.length > 0 && <button type="button" className="chip" onClick={() => { setQuery(''); setCategory('全部'); setSource('全部来源'); setKind('all') }}>清除筛选</button>}
      </div> : <div className="home-grid">
        {filtered.map((entry) => <div key={entry.id} className={entry.kind === 'sentence' ? 'home-grid-item sentence' : 'home-grid-item'}>
          <EntryCard key={entry.updatedAt} entry={entry} compact onEdit={() => onEdit(entry)} onUpdated={onUpdated} onDelete={() => onDelete(entry)} />
        </div>)}
      </div>}
    </div>
  )
}
