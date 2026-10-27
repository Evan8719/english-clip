import { useCallback, useEffect, useState } from 'react'
import type { Entry, Familiarity, TabId } from './types'
import { createEntry, listEntries, reviewEntry, softDeleteEntry, updateEntry } from './db/entries'
import { ensureLexiconLoaded } from './lib/lexicon'
import { listCategories, migrateLegacyEntryCategories } from './lib/categories'
import { warmSpeechVoices } from './lib/speech'
import { getCurrentUser, isSyncConfigured, scheduleSilentSync, syncNow } from './lib/sync'
import { CaptureModal } from './components/CaptureModal'
import { HomeView } from './components/HomeView'
import { ReviewView } from './components/ReviewView'
import { MaterialsView } from './components/MaterialsView'
import { SettingsView } from './components/SettingsView'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureSeed, setCaptureSeed] = useState('')
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [lexiconReady, setLexiconReady] = useState(false)
  const [lexiconError, setLexiconError] = useState('')

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
      .catch((error: Error) => setLexiconError(error.message))

    if (isSyncConfigured()) {
      void getCurrentUser().then((user) => {
        if (!user) return
        void syncNow().then(() => refresh())
      })
    }
  }, [refresh])

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

  async function handleReview(entry: Entry, familiarity: Familiarity) {
    await reviewEntry(entry.id, familiarity)
    await refresh()
    scheduleSilentSync()
  }

  function handleDelete(entry: Entry) {
    if (!window.confirm('删除这条记录？它会从本子中移除。')) return
    void softDeleteEntry(entry.id).then(() => {
      void refresh()
      scheduleSilentSync()
    })
  }

  return (
    <div className="app-shell">
      <main className="main">
        {tab === 'home' && (
          <HomeView
            entries={entries}
            categories={categories}
            onCreate={() => openCreate()}
            onEdit={openEdit}
            onUpdated={() => void refresh()}
            onDelete={handleDelete}
            lexiconStatus={lexiconReady ? '' : lexiconError ? '本地词库暂未加载' : '词库加载中…'}
          />
        )}
        {tab === 'review' && (
          <ReviewView
            entries={entries}
            onEdit={openEdit}
            onUpdated={() => void refresh()}
            onReview={handleReview}
            onHome={() => setTab('home')}
          />
        )}
        {tab === 'materials' && <MaterialsView />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="tabbar" aria-label="主导航">
        <button type="button" className={tab === 'home' ? 'tab active' : 'tab'} onClick={() => setTab('home')}>首页</button>
        <button type="button" className={tab === 'review' ? 'tab active' : 'tab'} onClick={() => setTab('review')}>复习</button>
        <button type="button" className={tab === 'materials' ? 'tab active' : 'tab'} onClick={() => setTab('materials')}>素材</button>
        <button type="button" className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>设置</button>
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
          setTab('home')
        }}
      />
    </div>
  )
}
