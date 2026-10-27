# Shared app layout

The entire shell and bottom navigation live in App.tsx. It uses tab state, not URL routes. All layouts use max-width 720px and padding 20px 16px 96px; the current home is a single column at every viewport. Branding is text-only in the current header.

### src/App.tsx

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Entry, Lemma, TabId } from './types'
import {
  createEntry,
  getRecentEntries,
  getStaleEntries,
  listEntries,
  pickDailyFlip,
  reviewEntry,
  softDeleteEntry,
  updateEntry,
} from './db/entries'
import { ensureLexiconLoaded, lemmaToEnrichment } from './lib/lexicon'
import {
  categoriesForFilter,
  listCategories,
  listSources,
  migrateLegacyEntryCategories,
  normalizeCategory,
} from './lib/categories'
import { warmSpeechVoices } from './lib/speech'
import { getCurrentUser, isSyncConfigured, scheduleSilentSync, syncNow } from './lib/sync'
import { CaptureModal } from './components/CaptureModal'
import { EntryCard } from './components/EntryCard'
import { LibraryView } from './components/LibraryView'
import { SettingsView } from './components/SettingsView'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [entries, setEntries] = useState<Entry[]>([])
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureSeed, setCaptureSeed] = useState('')
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [lexiconReady, setLexiconReady] = useState(false)
  const [lexiconError, setLexiconError] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [filterCategory, setFilterCategory] = useState<string>('全部')
  const [filterSource, setFilterSource] = useState<string>('全部来源')
  const [recentExpanded, setRecentExpanded] = useState(false)

  const refresh = useCallback(async () => {
    await migrateLegacyEntryCategories()
    setEntries(await listEntries())
    setCategories(await listCategories())
  }, [])

  useEffect(() => {
    warmSpeechVoices()
    void refresh()
    void ensureLexiconLoaded()
      .then(() => setLexiconReady(true))
      .catch((e: Error) => setLexiconError(e.message))

    if (isSyncConfigured()) {
      void getCurrentUser().then((user) => {
        if (!user) return
        void syncNow().then(() => refresh())
      })
    }
  }, [refresh])

  const filterCategories = useMemo(
    () => categoriesForFilter(categories, entries),
    [categories, entries],
  )

  const sources = useMemo(() => {
    if (filterCategory === '全部') return []
    return listSources(entries, filterCategory)
  }, [entries, filterCategory])

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const cat = normalizeCategory(e.category)
      const catOk = filterCategory === '全部' || cat === filterCategory
      const srcOk =
        filterSource === '全部来源' || (e.source || '') === filterSource
      return catOk && srcOk
    })
  }, [entries, filterCategory, filterSource])

  const dailyFlip = useMemo(() => pickDailyFlip(filtered, 5), [filtered])
  const recent = getRecentEntries(filtered, 12)
  const stale = getStaleEntries(filtered, 8)

  function openCreate(seed = '') {
    setEditingEntry(null)
    setCaptureSeed(seed)
    setCaptureOpen(true)
  }

  function openEdit(entry: Entry) {
    setEditingEntry(entry)
    setCaptureSeed('')
    setCaptureOpen(true)
  }

  async function handleCollect(lemma: Lemma) {
    await createEntry({
      text: lemma.headword,
      kind: lemma.headword.includes(' ') ? 'phrase' : 'word',
      category: '其他',
      enrichment: lemmaToEnrichment(lemma),
    })
    await refresh()
    scheduleSilentSync()
    setTab('home')
  }

  return (
    <div className="app-shell">
      <main className="main">
        {tab === 'home' && (
          <div className="page">
            <header className="page-header brand">
              <p className="brand-mark">English Clip</p>
              <h1>英语剪贴本</h1>
              <p className="lede">记下有用的词，想起来再翻。无催促。</p>
            </header>

            <button
              type="button"
              className="primary capture-btn"
              onClick={() => openCreate()}
            >
              + 记录
            </button>

            <p className="muted tiny">
              {lexiconReady
                ? '本地词库已就绪'
                : lexiconError
                  ? `词库未加载：${lexiconError}`
                  : '词库加载中…'}
            </p>

            <div className="kind-row filter-row">
              <button
                type="button"
                className={filterCategory === '全部' ? 'chip active' : 'chip'}
                onClick={() => {
                  setFilterCategory('全部')
                  setFilterSource('全部来源')
                }}
              >
                全部
              </button>
              {filterCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={filterCategory === c ? 'chip active' : 'chip'}
                  onClick={() => {
                    setFilterCategory(c)
                    setFilterSource('全部来源')
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            {filterCategory !== '全部' && sources.length > 0 && (
              <div className="kind-row filter-row">
                <button
                  type="button"
                  className={filterSource === '全部来源' ? 'chip active' : 'chip'}
                  onClick={() => setFilterSource('全部来源')}
                >
                  全部来源
                </button>
                {sources.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={filterSource === s ? 'chip active' : 'chip'}
                    title={s}
                    onClick={() => setFilterSource(s)}
                  >
                    {s.length > 18 ? `${s.slice(0, 18)}…` : s}
                  </button>
                ))}
              </div>
            )}

            <section className="section">
              <h2>今日随手翻</h2>
              <p className="muted tiny">今天固定这几张，点开翻一翻就行，没有打卡。</p>
              {dailyFlip.length === 0 ? (
                <p className="muted">还没有条目。先记几个词吧。</p>
              ) : (
                <div className="stack">
                  {dailyFlip.map((entry) => (
                    <EntryCard
                      key={`daily-${entry.id}`}
                      entry={entry}
                      onEdit={() => openEdit(entry)}
                      onUpdated={() => void refresh()}
                      onReview={(familiarity) => {
                        void reviewEntry(entry.id, familiarity).then(() => {
                          void refresh()
                          scheduleSilentSync()
                        })
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <h2>许久未见</h2>
              {stale.length === 0 ? (
                <p className="muted">还没有可复习的条目。</p>
              ) : (
                <div className="stack">
                  {stale.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={() => openEdit(entry)}
                      onUpdated={() => void refresh()}
                      onReview={(familiarity) => {
                        void reviewEntry(entry.id, familiarity).then(() => {
                          void refresh()
                          scheduleSilentSync()
                        })
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="section">
              <button
                type="button"
                className="collapse-toggle"
                aria-expanded={recentExpanded}
                onClick={() => setRecentExpanded((v) => !v)}
              >
                <span className="collapse-toggle__title">
                  最近收录
                  {recent.length > 0 ? ` · ${recent.length}` : ''}
                </span>
                <span className="collapse-toggle__action">
                  {recent.length === 0 ? '' : recentExpanded ? '收起 ▲' : '展开 ▼'}
                </span>
              </button>
              {recent.length === 0 ? (
                <p className="muted">空空如也。看到好词就记下来。</p>
              ) : recentExpanded ? (
                <div className="stack">
                  {recent.map((entry) => (
                    <EntryCard
                      key={`recent-${entry.id}`}
                      entry={entry}
                      compact
                      onEdit={() => openEdit(entry)}
                      onUpdated={() => void refresh()}
                      onDelete={() => {
                        void softDeleteEntry(entry.id).then(() => {
                          void refresh()
                          scheduleSilentSync()
                        })
                      }}
                      onReview={(familiarity) => {
                        void reviewEntry(entry.id, familiarity).then(() => {
                          void refresh()
                          scheduleSilentSync()
                        })
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted tiny">已折叠，点上方展开查看。</p>
              )}
            </section>
          </div>
        )}

        {tab === 'library' && <LibraryView onCollect={handleCollect} />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="tabbar" aria-label="主导航">
        <button
          type="button"
          className={tab === 'home' ? 'tab active' : 'tab'}
          onClick={() => setTab('home')}
        >
          首页
        </button>
        <button
          type="button"
          className={tab === 'library' ? 'tab active' : 'tab'}
          onClick={() => setTab('library')}
        >
          词库
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setTab('settings')}
        >
          设置
        </button>
      </nav>

      <CaptureModal
        open={captureOpen}
        entry={editingEntry}
        initialText={captureSeed}
        entries={entries}
        onClose={() => {
          setCaptureOpen(false)
          setEditingEntry(null)
        }}
        onSave={async (input) => {
          if (editingEntry) {
            await updateEntry(editingEntry.id, {
              text: input.text,
              kind: input.kind,
              context: input.context,
              note: input.note,
              category: input.category,
              source: input.source,
              sourceDetail: input.sourceDetail,
              mySentence: input.mySentence,
              enrichment: input.enrichment,
            })
          } else {
            await createEntry(input)
          }
          await refresh()
          scheduleSilentSync()
        }}
      />
    </div>
  )
}

```
