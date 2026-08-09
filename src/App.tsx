import { useCallback, useEffect, useState } from 'react'
import type { Entry, Lemma, TabId } from './types'
import {
  createEntry,
  getRecentEntries,
  getStaleEntries,
  listEntries,
  reviewEntry,
  softDeleteEntry,
} from './db/entries'
import { ensureLexiconLoaded, lemmaToEnrichment } from './lib/lexicon'
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
  const [lexiconReady, setLexiconReady] = useState(false)
  const [lexiconError, setLexiconError] = useState('')

  const refresh = useCallback(async () => {
    setEntries(await listEntries())
  }, [])

  useEffect(() => {
    void refresh()
    void ensureLexiconLoaded()
      .then(() => setLexiconReady(true))
      .catch((e: Error) => setLexiconError(e.message))

    // Phone PWA + Mac app: pull/push cloud copy when already logged in.
    if (isSyncConfigured()) {
      void getCurrentUser().then((user) => {
        if (!user) return
        void syncNow().then(() => refresh())
      })
    }
  }, [refresh])

  const recent = getRecentEntries(entries, 12)
  const stale = getStaleEntries(entries, 8)

  async function handleCollect(lemma: Lemma) {
    await createEntry({
      text: lemma.headword,
      kind: lemma.headword.includes(' ') ? 'phrase' : 'word',
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
              onClick={() => {
                setCaptureSeed('')
                setCaptureOpen(true)
              }}
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

            <section className="section">
              <h2>许久未见</h2>
              {stale.length === 0 ? (
                <p className="muted">还没有可复习的条目。先记几个词吧。</p>
              ) : (
                <div className="stack">
                  {stale.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
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
              <h2>最近收录</h2>
              {recent.length === 0 ? (
                <p className="muted">空空如也。看到好词就记下来。</p>
              ) : (
                <div className="stack">
                  {recent.map((entry) => (
                    <EntryCard
                      key={`recent-${entry.id}`}
                      entry={entry}
                      compact
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
        initialText={captureSeed}
        onClose={() => setCaptureOpen(false)}
        onSave={async (input) => {
          await createEntry(input)
          await refresh()
          scheduleSilentSync()
        }}
      />
    </div>
  )
}
