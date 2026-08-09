import { useEffect, useState } from 'react'
import type { Lemma } from '../types'
import { frequencyLabel, searchLemmas } from '../lib/lexicon'

interface Props {
  onCollect: (lemma: Lemma) => Promise<void>
}

export function LibraryView({ onCollect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Lemma[]>([])
  const [selected, setSelected] = useState<Lemma | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void searchLemmas(query, 40).then(setResults)
    }, 120)
    return () => window.clearTimeout(handle)
  }, [query])

  return (
    <div className="page">
      <header className="page-header">
        <h1>词库</h1>
        <p className="lede">离线常用词，可搜索、可收入本子。</p>
      </header>

      <label className="field">
        <span>搜索</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入开头字母，如 look"
        />
      </label>

      {!query.trim() && (
        <p className="muted">输入关键词开始检索本地词包（无需联网）。</p>
      )}

      <ul className="lemma-list">
        {results.map((lemma) => (
          <li key={lemma.id}>
            <button type="button" className="lemma-row" onClick={() => setSelected(lemma)}>
              <span className="lemma-word">{lemma.headword}</span>
              <span className="muted">
                {frequencyLabel(lemma.frequencyBand)}
                {lemma.cefrBand ? ` · ${lemma.cefrBand}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{selected.headword}</h2>
              <button type="button" className="ghost" onClick={() => setSelected(null)}>
                关闭
              </button>
            </header>
            {selected.phonetic && <p className="phonetic">{selected.phonetic}</p>}
            <p className="meta-line">
              {frequencyLabel(selected.frequencyBand)}
              {selected.cefrBand ? ` · CEFR ${selected.cefrBand}` : ''}
              {selected.pos ? ` · ${selected.pos}` : ''}
            </p>
            {selected.definitions.map((d) => (
              <p key={d} className="def">
                {d}
              </p>
            ))}
            {selected.examples.map((ex) => (
              <p key={ex} className="example">
                e.g. {ex}
              </p>
            ))}
            <button
              type="button"
              className="primary wide"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void onCollect(selected)
                  .then(() => setSelected(null))
                  .finally(() => setBusy(false))
              }}
            >
              收入我的本子
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
