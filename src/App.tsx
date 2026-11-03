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
import { DictionaryView } from './components/DictionaryView'
import { PracticeView } from './components/PracticeView'
import { LearningMethodsView } from './components/LearningMethodsView'

interface CaptureSeed { text: string; context?: string; category?: string; source?: string; sourceDetail?: string }

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureSeed, setCaptureSeed] = useState<CaptureSeed>({ text: '' })
  const [practiceSeed, setPracticeSeed] = useState<{ text: string; title: string } | null>(null)
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

  function openCreate(seed: CaptureSeed = { text: '' }) {
    setEditingEntry(null)
    setCaptureSeed(seed)
    setCaptureOpen(true)
  }

  function openEdit(entry: Entry) {
    setEditingEntry(entry)
    setCaptureSeed({ text: '' })
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
    <div className="redesign-shell">
      <header className="redesign-mobile-header"><div className="redesign-logo"><img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" /><strong>English Clip</strong></div><div className="redesign-mobile-tools"><button type="button" className={tab === 'methods' ? 'active' : ''} onClick={() => setTab('methods')}>方法</button><button type="button" onClick={() => setTab('settings')} aria-label="设置">设置</button></div></header>
      <div className="redesign-layout"><aside className="redesign-rail"><div className="redesign-logo"><img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" /><span><strong>English Clip</strong><small>英语剪贴本</small></span></div><button className="redesign-primary rail-capture" onClick={() => openCreate()}>＋ 记录新表达</button><nav aria-label="桌面主导航"><button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>▤　我的本子</button><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>◇　复习</button><button className={tab === 'practice' ? 'active' : ''} onClick={() => { setPracticeSeed(null); setTab('practice') }}>◉　开口练</button><button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>♫　素材库</button><button className={tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('dictionary')}>Aa　词典</button><button className={tab === 'methods' ? 'active' : ''} onClick={() => setTab('methods')}>✧　学习方法</button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙　设置</button></nav><p className="rail-foot">本地记录 · NAS 同步<br />记下来，想起时再翻。</p></aside>
      <main className="redesign-workspace">
        {tab === 'home' && (
          <HomeView
            entries={entries}
            categories={categories}
            onEdit={openEdit}
            onUpdated={() => void refresh()}
            onDelete={handleDelete}
            lexiconStatus={lexiconReady ? '' : lexiconError ? '本地词库暂未加载' : '词库加载中…'}
            onCapture={() => openCreate()}
            onMaterials={() => setTab('materials')}
            onDictionary={() => setTab('dictionary')}
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
        {tab === 'materials' && <MaterialsView onCapture={openCreate} onPractice={(text, title) => { setPracticeSeed({ text, title }); setTab('practice') }} onSettings={() => setTab('settings')} />}
        {tab === 'dictionary' && <DictionaryView onCapture={openCreate} />}
        {tab === 'practice' && <PracticeView entries={entries} seed={practiceSeed} onCapture={openCreate} />}
        {tab === 'methods' && <LearningMethodsView onNavigate={setTab} onCapture={() => openCreate()} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      </div>
      <nav className="redesign-mobile-nav" aria-label="手机主导航"><button className={tab === 'home' || tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('home')}>本子</button><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>复习</button><button className="redesign-nav-plus" aria-label="记录新词句" onClick={() => openCreate()}>＋</button><button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>素材</button><button className={tab === 'practice' ? 'active' : ''} onClick={() => { setPracticeSeed(null); setTab('practice') }}>开口练</button></nav>

      <CaptureModal
        open={captureOpen}
        entry={editingEntry}
        initialText={captureSeed.text}
        initialContext={captureSeed.context}
        initialCategory={captureSeed.category}
        initialSource={captureSeed.source}
        initialSourceDetail={captureSeed.sourceDetail}
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
