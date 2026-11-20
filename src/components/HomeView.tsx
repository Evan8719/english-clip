import { MaterialSheet } from './MaterialSheet'
import { ContinueLearning } from './ContinueLearning'
import { useMemo, useState } from 'react'
import type { Entry, EntryKind } from '../types'
import { categoriesForFilter, listSources, normalizeCategory } from '../lib/categories'
import { EntryCard } from './EntryCard'
import { NavIcon } from './NavIcon'
import { SceneClassifier } from './SceneClassifier'

interface Props {
  onContinue: (id: string) => void
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

const defaultFilter = {
  category: '全部', source: '全部来源', tag: '', scene: '',
  kind: 'all' as EntryKind | 'all', order: 'recent' as 'recent' | 'alphabetical',
}

export function HomeView({ onContinue, entries, categories, onEdit, onUpdated, onDelete, lexiconStatus, onCapture, onMaterials, onDictionary, onOpenOrigin, onDaily }: Props) {
  const tags = [...new Set(entries.flatMap(item => item.tags || []))].sort((a,b) => a.localeCompare(b, 'zh'))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(defaultFilter)
  const [draft, setDraft] = useState<typeof defaultFilter | null>(null)
  const [classifying, setClassifying] = useState(false)
  const { tag, scene, category, source, kind, order } = filter
  const scenes = useMemo(() => [...new Set(entries.flatMap(entry => entry.scene ? [entry.scene] : []))].sort((a,b) => a.localeCompare(b,'zh')), [entries])
  const [selectedId, setSelectedId] = useState('')

  const categoriesShown = useMemo(() => categoriesForFilter(categories, entries), [categories, entries])
  const sources = draft && draft.category !== '全部' ? listSources(entries, draft.category) : []
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const result = entries.filter((entry) => {
      if (category !== '全部' && normalizeCategory(entry.category) !== category) return false
      if (source !== '全部来源' && entry.source !== source) return false
      if (tag && !(entry.tags || []).includes(tag)) return false
      if (scene && entry.scene !== scene) return false
      if (kind !== 'all' && entry.kind !== kind) return false
      if (!term) return true
      return [entry.text, entry.context, entry.note, entry.source, entry.sourceDetail, entry.mySentence, entry.scene, ...(entry.tags || []),
        ...(entry.enrichment?.definitionsZh ?? []), ...(entry.enrichment?.definitions ?? [])]
        .some((value) => value?.toLocaleLowerCase().includes(term))
    })
    return order === 'alphabetical'
      ? result.sort((a, b) => a.text.localeCompare(b.text, 'en'))
      : result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [entries, query, category, source, kind, order, tag, scene])

  const selected = filtered.find((entry) => entry.id === selectedId) || filtered[0]

  return (
    <div className="redesign-page redesign-home">
      <header className="notebook-heading"><h1>我的本子</h1><button className="fidelity-icon notebook-capture" aria-label="记录新表达" onClick={onCapture}><NavIcon name="plus" /></button></header>
      <ContinueLearning onOpen={onContinue} />
      <div className="home-controls">
        <div className="home-control-main">
          <NavIcon name="search" /><input className="home-search" type="search" aria-label="搜索已记录的词句" placeholder="搜索词句、释义或来源" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="fidelity-icon" aria-label="调整本子筛选与排序" aria-expanded={Boolean(draft)} aria-haspopup="dialog" onClick={() => setDraft(filter)}><NavIcon name="filter" /></button>
        </div>
        <nav className="notebook-tabs" aria-label="来源快捷筛选">
          {['全部', '播客', '阅读', '影视剧', 'YouTube'].map(value => <button key={value} aria-pressed={category === value && !tag && source === '全部来源'} onClick={() => setFilter({ ...filter, category: value, source: '全部来源', tag: '' })}>{value}</button>)}
          <button aria-pressed={Boolean(tag)} onClick={() => setDraft(filter)}>我的标签</button>
          {scene && <button aria-pressed="true" onClick={() => setFilter({ ...filter, scene: '' })}>{scene} ×</button>}
        </nav>
        {draft && <MaterialSheet variant="filters" title="本子筛选与排序" onClose={() => setDraft(null)}>
          <div className="home-adjust">
          <label>来源类型<select aria-label="来源类型" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value, source: '全部来源' })}><option>全部</option>{categoriesShown.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>自定义标签<select aria-label="按标签筛选" value={draft.tag} onChange={e => setDraft({ ...draft, tag: e.target.value })}><option value="">全部标签</option>{tags.map(t => <option key={t}>{t}</option>)}</select></label>
          <label>使用场景<select aria-label="按场景筛选" value={draft.scene} onChange={e => setDraft({ ...draft, scene: e.target.value })}><option value="">全部场景</option>{scenes.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>类型<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as typeof draft.kind })}>
            <option value="all">全部词句</option><option value="word">单词</option><option value="phrase">短语</option><option value="sentence">句子</option>
          </select></label>
          <label>排序<select value={draft.order} onChange={event => setDraft({ ...draft, order: event.target.value as typeof draft.order })}>
            <option value="recent">最近记录</option><option value="alphabetical">字母顺序</option>
          </select></label>
          {sources.length > 0 && <label className="home-source-select">具体来源<select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}>
            <option value="全部来源">全部来源</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>}
          </div>
          <div className="app-sheet-footer">
            <button className="chip" onClick={() => setDraft(defaultFilter)}>重置</button>
            <button className="redesign-primary" onClick={() => { setFilter(draft); setDraft(null) }}>查看结果</button>
          </div>
        </MaterialSheet>}
      </div>

      <div className="notebook-status"><span>{filtered.length} 条{category !== '全部' ? ` · ${category}` : ''}{tag ? ` · #${tag}` : ''}</span><button className="redesign-text-button notebook-classify" disabled={!filtered.length} onClick={() => setClassifying(true)}><NavIcon name="sparkle" />AI 分类</button><button className="redesign-text-button" onClick={onDaily}>每日练习<NavIcon name="next" /></button>{lexiconStatus && <span role="status">{lexiconStatus}</span>}<button className="notebook-dictionary" onClick={onDictionary}>词典</button><button className="notebook-dictionary" onClick={onMaterials}>素材</button></div>
      {classifying && <SceneClassifier entries={filtered} scenes={scenes} onClose={() => setClassifying(false)} onUpdated={onUpdated} />}
      {filtered.length === 0 ? <div className="home-empty panel">
        <p>{entries.length ? '没有找到符合条件的词句。' : '本子里还没有词句。看到想记的表达，就点上方的「记录新表达」。'}</p>
        {entries.length > 0 && <button type="button" className="chip" onClick={() => { setQuery(''); setFilter(defaultFilter) }}>清除筛选</button>}
      </div> : <div className="redesign-home-layout"><div className="home-grid">
        {filtered.map((entry) => <div key={entry.id} onClick={() => setSelectedId(entry.id)} className={entry.kind === 'sentence' ? 'home-grid-item sentence' : 'home-grid-item'}>
          <EntryCard key={entry.updatedAt} entry={entry} compact onEdit={() => onEdit(entry)} onUpdated={onUpdated} onOpenOrigin={entry.enrichment?.origin ? () => onOpenOrigin?.(entry.enrichment?.origin) : undefined} onDelete={() => onDelete(entry)} />
        </div>)}
      </div><aside className="redesign-detail">{selected && <><span className="redesign-tag">{selected.kind === 'word' ? '单词' : selected.kind === 'phrase' ? '短语' : '句子'} · {selected.category || '其他'}</span><h2>{selected.text}</h2>{selected.kind === 'word' && selected.enrichment?.phonetic && <p>{selected.enrichment.phonetic}</p>}{selected.enrichment?.definitionsZh?.map((line) => <p className="detail-meaning" key={line}>{line}</p>)}{selected.enrichment?.definitions?.slice(0, 2).map((line) => <p className="detail-definition" key={line}>{line}</p>)}{selected.context && <div className="detail-context"><small>原句语境</small><p>{selected.context}</p></div>}{selected.source && <p className="detail-source">来源 · {selected.source}</p>}<button className="redesign-secondary" onClick={() => onEdit(selected)}>编辑这条记录</button></>}</aside></div>}
    </div>
  )
}
