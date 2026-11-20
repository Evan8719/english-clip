import { GlobalPageHeader, PageNavigationProvider } from './components/PageNavigation'
import { flushLearning } from './lib/learningProgress'
import { NavIcon } from './components/NavIcon'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Entry, Familiarity, TabId } from './types'
import { createEntry, getEntry, listEntries, reviewEntry, softDeleteEntry, updateEntry } from './db/entries'
import { ensureLexiconLoaded } from './lib/lexicon'
import { listCategories, migrateLegacyEntryCategories } from './lib/categories'
import { warmSpeechVoices } from './lib/speech'
import { getCurrentUser, getStoredUserId, isSyncConfigured, scheduleSilentSync, syncNow } from './lib/sync'
import { getNotebookId, observeSession } from './lib/session'
import { CaptureModal } from './components/CaptureModal'
import { HomeView } from './components/HomeView'
import { ReviewView } from './components/ReviewView'
import { MaterialsView } from './components/MaterialsView'
import { SettingsView } from './components/SettingsView'
import { DictionaryView } from './components/DictionaryView'
import { PracticeView } from './components/PracticeView'
import { LearningMethodsView } from './components/LearningMethodsView'
import { explainWithAi } from './lib/media'

interface CaptureSeed { text: string; context?: string; category?: string; source?: string; sourceDetail?: string; origin?: { materialId: string; chapter?: number; paragraph?: number; courseId?: string; episode?: number; timestamp?: number } }
const tabTitles: Record<TabId, string> = { home: '我的本子', review: '复习', practice: '开口练', materials: '素材', dictionary: '词典', methods: '学习方法', settings: '设置' }
const emptyEntries: Entry[] = []

export default function App() {
  useLayoutEffect(() => { const theme = localStorage.getItem('ec.appearance'); document.documentElement.dataset.appearance = ['paper','clean','night'].includes(theme || '') ? theme! : 'paper' }, [])
  const workspace = useRef<HTMLElement>(null)
  const scrollPositions = useRef<Partial<Record<TabId, number>>>({})
  const [dailyRequest, setDailyRequest] = useState(0)
  const [reviewVisited, setReviewVisited] = useState(false)
  const [practiceVisited, setPracticeVisited] = useState(false)
  const [materialsVisited, setMaterialsVisited] = useState(false)
  const [materialSession, setMaterialSession] = useState(0)
  const [materialOrigin, setMaterialOrigin] = useState<CaptureSeed['origin']>(undefined)
  const settingsReturn = useRef<TabId>('home')
  const settingsBackLabel = useRef('本子')
  const [tab, setTabState] = useState<TabId>('home')
  useLayoutEffect(() => {
    if (workspace.current) workspace.current.scrollTop = scrollPositions.current[tab] || 0
    if (tab === 'materials') setMaterialsVisited(true)
    if (tab === 'practice') setPracticeVisited(true)
    if (tab === 'review') setReviewVisited(true)
  }, [tab])
  function setTab(next: TabId) {
    if (next === tab) return
    if (next === 'settings' && tab !== 'settings') {
      settingsReturn.current = tab
      settingsBackLabel.current = tab === 'home' ? '本子' : tabTitles[tab]
    }
    if (workspace.current) scrollPositions.current[tab] = workspace.current.scrollTop
    setTabState(next)
  }
  const [notebook, setNotebook] = useState(getNotebookId)
  const [entrySnapshot, setEntrySnapshot] = useState<{ notebook: string; entries: Entry[] }>()
  const entries = entrySnapshot?.notebook === notebook ? entrySnapshot.entries : emptyEntries
  const [categories, setCategories] = useState<string[]>([])
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureSeed, setCaptureSeed] = useState<CaptureSeed>({ text: '' })
  const [practiceSeed, setPracticeSeed] = useState<{ text: string; title: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [lexiconReady, setLexiconReady] = useState(false)
  const [lexiconError, setLexiconError] = useState('')

  const refresh = useCallback(async () => {
    const current = getNotebookId()
    await migrateLegacyEntryCategories(current)
    const [items, labels] = await Promise.all([listEntries(current), listCategories()])
    if (current !== getNotebookId()) return
    setEntrySnapshot({ notebook: current, entries: items })
    setCategories(labels)
  }, [])

  useEffect(() => {
    let previous = getNotebookId()
    const stop = observeSession(() => {
      const current = getNotebookId()
      if (current === previous) return
      previous = current
      setNotebook(current)
      setCaptureOpen(false)
      setEditingEntry(null)
      setCaptureSeed({ text: '' })
      setMaterialOrigin(undefined)
      setPracticeSeed(null)
      scrollPositions.current = {}
      void refresh()
    })
    const synced = () => { void refresh() }
    window.addEventListener('english-clip:entries-synced', synced)
    return () => {
      stop()
      window.removeEventListener('english-clip:entries-synced', synced)
    }
  }, [refresh])

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

  useEffect(() => {
    const sync = () => { void flushLearning() }
    sync(); window.addEventListener('online', sync)
    const timer = window.setInterval(sync, 30000)
    return () => { window.removeEventListener('online', sync); window.clearInterval(timer) }
  }, [])

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
    if (notebook !== getNotebookId()) return
    await reviewEntry(entry.id, familiarity)
    await refresh()
    scheduleSilentSync()
  }

  function handleDelete(entry: Entry) {
    if (!window.confirm('删除这条记录？它会从本子中移除。')) return
    if (notebook !== getNotebookId()) return
    void softDeleteEntry(entry.id).then(() => {
      void refresh()
      scheduleSilentSync()
    })
  }

  const pendingMeanings = useRef(new Set<string>())
  const completeAiMeaning = useCallback(async (saved: Entry) => {
    const uid = getStoredUserId(), currentNotebook = getNotebookId(), requestId = `${uid}:${saved.id}`
    if (!uid || !navigator.onLine || pendingMeanings.current.has(requestId)) return
    pendingMeanings.current.add(requestId)
    try {
      const result = await explainWithAi(saved.text, saved.context || '', saved.source || '')
      const current = await getEntry(saved.id, currentNotebook)
      if (uid !== getStoredUserId() || !current || current.text !== saved.text || current.context !== saved.context || current.source !== saved.source || !current.enrichment?.aiPending) return
      await updateEntry(saved.id, { enrichment: { ...current.enrichment, definitions: [], definitionsZh: result.definitionsZh, examples: [], provider: result.provider === 'gemini' ? 'ai-gemini' : 'ai-deepseek', aiNote: result.note, aiUncertain: result.uncertain, aiPending: false } }, currentNotebook)
      await refresh(); scheduleSilentSync()
    } catch {
      const current = await getEntry(saved.id, currentNotebook)
      if (uid === getStoredUserId() && current?.text === saved.text && current.context === saved.context && current.source === saved.source && current.enrichment?.aiPending) {
        await updateEntry(saved.id, { enrichment: { ...current.enrichment, aiPending: false, aiNote: 'AI 释义未完成，可在编辑中重试' } }, currentNotebook); await refresh(); scheduleSilentSync()
      }
    } finally { pendingMeanings.current.delete(requestId) }
  }, [refresh])

  useEffect(() => {
    if (notebook !== getNotebookId()) return
    for (const entry of entries.filter(item => item.enrichment?.aiPending).slice(0, 3)) void completeAiMeaning(entry)
  }, [entries, notebook, completeAiMeaning])
  useEffect(() => { const online = () => { void refresh() }; window.addEventListener('online', online); return () => window.removeEventListener('online', online) }, [refresh])

  return (
    <PageNavigationProvider scope={tab} base={{
      title: tabTitles[tab],
      path: tab === 'methods' ? ['复习', '学习方法'] : [tabTitles[tab]],
      backLabel: tab === 'settings' ? settingsBackLabel.current : undefined,
      onAncestor: tab === 'methods' ? () => setTab('review') : undefined,
      onBack: tab === 'home' ? undefined : () => {
        if (tab === 'settings' || tab === 'methods') {
          if (workspace.current) scrollPositions.current[tab] = workspace.current.scrollTop
          setTabState(tab === 'settings' ? settingsReturn.current : 'review')
        } else setTab('home')
      },
    }}><div className="redesign-shell fidelity-shell">
      <div className="redesign-layout"><aside className="redesign-rail"><button className="redesign-primary rail-capture" onClick={() => openCreate()}><NavIcon name="plus" />记录新表达</button><nav aria-label="桌面主导航"><button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><NavIcon name="book" /><span>我的本子</span></button><button className={(tab === 'review' || tab === 'methods') ? 'active' : ''} onClick={() => setTab('review')}><NavIcon name="review" /><span>复习</span></button><button className={tab === 'practice' ? 'active' : ''} onClick={() => { setPracticeSeed(null); setTab('practice') }}><NavIcon name="chat" /><span>开口练</span></button><button className={tab === 'materials' ? 'active' : ''} onClick={() => { setTab('materials') }}><NavIcon name="audio" /><span>素材库</span></button><button className={tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('dictionary')}><NavIcon name="dictionary" /><span>词典</span></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><NavIcon name="settings" /><span>设置</span></button></nav><p className="rail-foot">本地记录 · NAS 同步<br />记下来，想起时再翻。</p></aside>
      <main ref={workspace} className="redesign-workspace">
        <GlobalPageHeader onSettings={(currentTitle) => {
          if (tab === 'settings') return
          setTab('settings')
          if (tab !== 'home') settingsBackLabel.current = currentTitle
        }} />
        <div hidden={tab !== 'home'}>
          <HomeView
            key={notebook}
            onContinue={id => { setMaterialSession(n => n + 1); setMaterialOrigin({ materialId: id }); setTab('materials') }}
            entries={entries}
            categories={categories}
            onEdit={openEdit}
            onUpdated={() => void refresh()}
            onDelete={handleDelete}
            lexiconStatus={lexiconReady ? '' : lexiconError ? '本地词库暂未加载' : '词库加载中…'}
            onCapture={() => openCreate()}
            onMaterials={() => { setTab('materials') }}
            onDictionary={() => setTab('dictionary')}
            onDaily={() => { setPracticeSeed(null); setDailyRequest(value => value + 1); setTab('practice') }}
            onOpenOrigin={(origin) => { setMaterialSession((n) => n + 1); setMaterialOrigin(origin); setTab('materials') }}
          />
        </div>
        {(tab === 'review' || reviewVisited) && <div hidden={tab !== 'review'}>
          <ReviewView
            key={notebook}
            entries={entries}
            onEdit={openEdit}
            onUpdated={() => void refresh()}
            onReview={handleReview}
            onHome={() => setTab('home')}
            onMethods={() => setTab('methods')}
          />
        </div>}
        {(tab === 'materials' || materialsVisited) && <div className="materials-pane" hidden={tab !== 'materials'}><MaterialsView active={tab === 'materials'} key={`${notebook}:${materialSession}:${materialOrigin?.materialId || 'library'}`} initialOrigin={materialOrigin} onCapture={openCreate} onPractice={(text, title) => { setPracticeSeed({ text, title }); setTab('practice') }} onSettings={() => setTab('settings')} /></div>}
        {tab === 'dictionary' && <DictionaryView onCapture={openCreate} />}
        {(tab === 'practice' || practiceVisited) && <div hidden={tab !== 'practice'}><PracticeView dailyRequest={dailyRequest} onOrigin={origin => { setMaterialSession(value => value + 1); setMaterialOrigin(origin); setTab('materials') }} key={notebook} active={tab === 'practice'} onReturn={practiceSeed ? () => setTab('materials') : undefined} entries={entries} seed={practiceSeed} onCapture={openCreate} /></div>}
        {tab === 'methods' && <LearningMethodsView onNavigate={setTab} onCapture={() => openCreate()} />}
        {tab === 'settings' && <SettingsView entryCount={entries.length} />}
      </main>
      </div>
      <nav className="redesign-mobile-nav" aria-label="手机主导航"><button className={tab === 'home' || tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('home')}><NavIcon name="book" /><span>本子</span></button><button className={(tab === 'review' || tab === 'methods') ? 'active' : ''} onClick={() => setTab('review')}><NavIcon name="review" /><span>复习</span></button><button className="redesign-nav-plus" aria-label="记录新词句" onClick={() => openCreate()}><NavIcon name="plus" /></button><button className={tab === 'materials' ? 'active' : ''} onClick={() => { setTab('materials') }}><NavIcon name="audio" /><span>素材</span></button><button className={tab === 'practice' ? 'active' : ''} onClick={() => { setPracticeSeed(null); setTab('practice') }}><NavIcon name="chat" /><span>开口练</span></button></nav>

      <CaptureModal
        key={notebook}
        open={captureOpen}
        entry={editingEntry}
        initialText={captureSeed.text}
        initialContext={captureSeed.context}
        initialCategory={captureSeed.category}
        initialSource={captureSeed.source}
        initialSourceDetail={captureSeed.sourceDetail}
        entries={entries}
        originMaterialId={captureSeed.origin?.materialId}
        onClose={() => {
          setCaptureOpen(false)
          setEditingEntry(null)
        }}
        onSave={async (input) => {
          if (notebook !== getNotebookId()) throw new Error('登录状态已改变，请重新打开记录面板。')
          const origin = editingEntry?.enrichment?.origin || captureSeed.origin
          const enrichment = origin ? { ...(input.enrichment || { definitions: [], examples: [] }), origin } : input.enrichment
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
              tags: input.tags,
              enrichment,
            }, notebook)
          } else {
            await createEntry({ ...input, enrichment }, notebook)
          }
          await refresh()
          scheduleSilentSync()
        }}
      />
    </div></PageNavigationProvider>
  )
}
