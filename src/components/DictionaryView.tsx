import { useEffect, useState } from 'react'
import type { Lemma } from '../types'
import { getLemma, searchLemmas } from '../lib/lexicon'
import { lookupZhGloss, splitZhGloss } from '../lib/zhGloss'
import { speakEnglish } from '../lib/speech'

interface Props { onCapture: (seed: { text: string; category?: string }) => void }

export function DictionaryView({ onCapture }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Lemma[]>([])
  const [selected, setSelected] = useState<Lemma | null>(null)
  const [zh, setZh] = useState<string[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    const value = query.trim()
    if (!value) { setResults([]); return }
    let active = true
    const timer = window.setTimeout(() => { void searchLemmas(value, 40).then((items) => { if (active) { setResults(items); setMessage(items.length ? '' : '离线词典未收录，可在首页直接记录。') } }).catch(() => { if (active) setMessage('词典暂未加载') }) }, 150)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])
  async function select(lemma: Lemma) {
    setSelected(lemma)
    const gloss = await lookupZhGloss(lemma.headword)
    setZh(gloss ? splitZhGloss(gloss) : lemma.definitionsZh || [])
  }
  async function exactLookup() {
    const value = query.trim()
    if (!value) return
    const lemma = await getLemma(value)
    if (lemma) void select(lemma)
    else setMessage('离线词典未收录这条表达。你仍可直接记录，并填写自己的理解。')
  }

  return <div className="redesign-page dictionary-page">
    <header className="redesign-heading"><div><p className="redesign-eyebrow">A DICTIONARY IN YOUR NOTEBOOK</p><h1>内置词典</h1><p>随手查词，不离开本子。英文释义与中文词义可离线查看。</p></div></header>
    <div className="dictionary-layout"><div><div className="dictionary-search-row"><input className="redesign-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void exactLookup() }} placeholder="输入英文单词" aria-label="查词" /><button className="redesign-primary" onClick={() => void exactLookup()}>查词</button></div>
      {message && <p className="redesign-message">{message}</p>}
      <div className="dictionary-results">{results.map((item) => <button key={item.id} className={selected?.headword === item.headword ? 'dictionary-result active' : 'dictionary-result'} onClick={() => void select(item)}><strong>{item.headword}</strong><span>{item.pos || '词条'} · {item.cefrBand || '常用词'}</span></button>)}</div>
    </div><aside className="dictionary-detail">{selected ? <><span className="redesign-tag">{selected.pos || '词条'} · {selected.cefrBand || '离线词典'}</span><h2>{selected.headword}</h2>{selected.phonetic && <p className="muted">{selected.phonetic}</p>}<button className="redesign-text-button" onClick={() => void speakEnglish(selected.headword, selected.audioUrl)}>▶ 听发音</button>{zh.length > 0 && <div className="dictionary-meanings"><h3>中文</h3>{zh.map((line) => <p key={line}>{line}</p>)}</div>}<div className="dictionary-meanings"><h3>英文释义</h3>{selected.definitions.map((line) => <p key={line}>{line}</p>)}</div>{selected.examples.length > 0 && <div className="dictionary-meanings"><h3>例句</h3>{selected.examples.map((line) => <p key={line}>{line}</p>)}</div>}<button className="redesign-primary" onClick={() => onCapture({ text: selected.headword, category: '阅读' })}>＋ 记进本子</button></> : <p className="muted">输入一个词，查看读音、释义和例句。</p>}</aside></div>
  </div>
}
