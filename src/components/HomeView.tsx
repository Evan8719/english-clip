import { useMemo, useState } from 'react'
import type { Entry, EntryKind } from '../types'
import { categoriesForFilter, listSources, normalizeCategory } from '../lib/categories'
import { EntryCard } from './EntryCard'
import { NavIcon } from './NavIcon'

interface Props {
  onOpenOrigin?: (origin: NonNullable<Entry['enrichment']>['origin']) => void
  onDaily: () => void
  entries: Entry[]
  categories: string[]
  onEdit: (entry: Entry) => void
  onUpdated: () => void
  onDelete: (entry: Entry) => void
  lexiconStatus: string
  onCapture: () => void
  onMaterials: () => void
  onDictionary: () => void
}

export function HomeView({ entries, categories, onEdit, onUpdated, onDelete, lexiconStatus, onCapture, onMaterials, onDictionary, onOpenOrigin, onDaily }: Props) {
  const [tag, setTag] = useState('')
  const tags = [...new Set(entries.flatMap(item => item.tags || []))].sort((a,b) => a.localeCompare(b, 'zh'))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [source, setSource] = useState('全部来源')
  const [kind, setKind] = useState<EntryKind | 'all'>('all')
  const [order, setOrder] = useState<'recent' | 'alphabetical'>('recent')
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  const categoriesShown = useMemo(() => categoriesForFilter(categories, entries), [categories, entries])
  const sources = useMemo(() => category === '全部' ? [] : listSources(entries, category), [entries, category])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const result = entries.filter((entry) => {
      if (category !== '全部' && normalizeCategory(entry.category) !== category) return false
      if (source !== '全部来源' && entry.source !== source) return false
      if (tag && !(entry.tags || []).includes(tag)) return false
      if (kind !== 'all' && entry.kind !== kind) return false
      if (!term) return true
      return [entry.text, entry.context, entry.note, entry.source, entry.sourceDetail, entry.mySentence, ...(entry.tags || []),
        ...(entry.enrichment?.definitionsZh ?? []), ...(entry.enrichment?.definitions ?? [])]
        .some((value) => value?.toLocaleLowerCase().includes(term))
    })
    return order === 'alphabetical'
      ? result.sort((a, b) => a.text.localeCompare(b.text, 'en'))
      : result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [entries, query, category, source, kind, order, tag])

  const selected = filtered.find((entry) => entry.id === selectedId) || filtered[0]

  return (
    <div className="redesign-page redesign-home">
      <header className="redesign-heading home-heading"><img className="home-brand-art" src={`${import.meta.env.BASE_URL}clip-wordcard.webp`} alt="英文词卡与回形针" width="160" height="107" />
        <div><div className="redesign-subtabs"><button className="active">词句</button><button onClick={onMaterials}>素材</button><button onClick={onDictionary}>词典</button></div><h1>我的本子</h1><p>把遇见的表达，慢慢变成自己的。</p></div>
        <button type="button" className="redesign-primary home-record" onClick={onCapture}><NavIcon name="plus" />记录新表达</button>
      </header>

      <div className="home-controls">
        <div className="home-control-main">
          <input className="home-search" type="search" aria-label="搜索已记录的词句" placeholder="搜索词句、释义或来源" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className={adjustOpen ? 'chip active' : 'chip'} aria-expanded={adjustOpen} aria-controls="home-adjust" onClick={() => setAdjustOpen((value) => !value)}>调整</button>
        </div>
        <div className="home-category-scroll" aria-label="按来源类型筛选">
          <button type="button" className={category === '全部' ? 'chip active' : 'chip'} onClick={() => { setCategory('全部'); setSource('全部来源') }}>全部</button>
          {categoriesShown.map((item) => <button key={item} type="button" className={category === item ? 'chip active' : 'chip'} onClick={() => { setCategory(item); setSource('全部来源') }}>{item}</button>)}
        </div>
        {tags.length > 0 && <div className="entry-tag-list"><label>标签 <select aria-label="按标签筛选" value={tag} onChange={e => setTag(e.target.value)}><option value="">全部标签</option>{tags.map(t => <option key={t}>{t}</option>)}</select></label>{tag && <button className="chip" onClick={() => setTag('')}>清除标签</button>}</div>}
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
        <div><h2>词句</h2><p className="muted tiny">{filtered.length} 条 · {order === 'recent' ? '最近记录在前' : '按字母排列'} · 点卡片翻看释义</p></div>
        <button className="redesign-text-button home-daily" onClick={onDaily}><NavIcon name="chat" />每日练习</button>
        {lexiconStatus && <span className="muted tiny">{lexiconStatus}</span>}
      </div>
      {filtered.length === 0 ? <div className="home-empty panel">
        <p>{entries.length ? '没有找到符合条件的词句。' : '本子里还没有词句。看到想记的表达，就点上方的「记录新表达」。'}</p>
        {entries.length > 0 && <button type="button" className="chip" onClick={() => { setQuery(''); setCategory('全部'); setSource('全部来源'); setKind('all'); setTag('') }}>清除筛选</button>}
      </div> : <div className="redesign-home-layout"><div className="home-grid">
        {filtered.map((entry) => <div key={entry.id} onClick={() => setSelectedId(entry.id)} className={entry.kind === 'sentence' ? 'home-grid-item sentence' : 'home-grid-item'}>
          <div className="entry-tag-list">{(entry.tags || []).map(t => <button className="entry-tag" key={t} onClick={e => { e.stopPropagation(); setTag(t) }}>#{t}</button>)}</div><EntryCard key={entry.updatedAt} entry={entry} compact onEdit={() => onEdit(entry)} onUpdated={onUpdated} onOpenOrigin={entry.enrichment?.origin ? () => onOpenOrigin?.(entry.enrichment?.origin) : undefined} onDelete={() => onDelete(entry)} />
        </div>)}
      </div><aside className="redesign-detail">{selected && <><span className="redesign-tag">{selected.kind === 'word' ? '单词' : selected.kind === 'phrase' ? '短语' : '句子'} · {selected.category || '其他'}</span><h2>{selected.text}</h2>{selected.enrichment?.phonetic && <p>{selected.enrichment.phonetic}</p>}{selected.enrichment?.definitionsZh?.map((line) => <p className="detail-meaning" key={line}>{line}</p>)}{selected.enrichment?.definitions?.slice(0, 2).map((line) => <p className="detail-definition" key={line}>{line}</p>)}{selected.context && <div className="detail-context"><small>原句语境</small><p>{selected.context}</p></div>}{selected.source && <p className="detail-source">来源 · {selected.source}</p>}<button className="redesign-secondary" onClick={() => onEdit(selected)}>编辑这条记录</button></>}</aside></div>}
    </div>
  )
}
