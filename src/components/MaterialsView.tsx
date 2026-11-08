import { saveLearning, mergeLearning } from '../lib/learningProgress'
import { materialGroup } from '../lib/materialGroups'
import { NavIcon } from './NavIcon'
import { MaterialStudy } from './MaterialStudy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getStoredUserId } from '../lib/sync'
import { getMedia, listMedia, patchMedia, processMedia, updateMediaTranscript, uploadMedia } from '../lib/media'
import type { MediaItem } from '../lib/media'
import { cacheMaterial, readCachedMaterial, estimateLevel, LEVELS } from '../lib/books'
import { BookReader } from './BookReader'
import { StoryCover } from './StoryCover'
import { MaterialImport } from './MaterialImport'
import { LinkCollector, LinkCollection } from './LinkCollection'
import { TimedWords } from './TimedWords'
import { lookupZhGloss } from '../lib/zhGloss'
import { authorizedApiFetch } from '../lib/sync'

interface StarterItem { id: string; title: string; titleZh: string; provider: string; sourceUrl: string; audio: string; durationSeconds: number; lines: Array<{ text: string }> }
type Selection = { type: 'starter'; item: StarterItem } | { type: 'mine'; item: MediaItem }
interface Props {
  active?: boolean
  initialOrigin?: { materialId: string; chapter?: number; paragraph?: number; courseId?: string; episode?: number; timestamp?: number }
  onCapture: (seed: { text: string; context?: string; category?: string; source?: string; sourceDetail?: string; origin?: { materialId: string; chapter?: number; paragraph?: number; courseId?: string; episode?: number; timestamp?: number } }) => void
  onPractice: (text: string, title: string) => void
  onSettings: () => void
}
const packBase = `${(import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''}/practice/starter-20261026/`
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function MaterialsView({ onCapture, onPractice, onSettings, initialOrigin, active = true }: Props) {
  const [starter, setStarter] = useState<StarterItem[]>([])
  const [mine, setMine] = useState<MediaItem[]>([])
  const [loggedIn, setLoggedIn] = useState(Boolean(getStoredUserId()))
  const [selected, setSelected] = useState<Selection | null>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [purpose, setPurpose] = useState(''), [series, setSeries] = useState('')
  const [loading, setLoading] = useState(false)
  const reloadTask = useRef<Promise<void> | null>(null)
  const [materialType, setMaterialType] = useState('all')
  const [sort, setSort] = useState(() => localStorage.getItem('ec.material-sort') || 'title')
  const [page, setPage] = useState(1)
  const [batchOpen, setBatchOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [transcript, setTranscript] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [word, setWord] = useState(''), [wordMeaning, setWordMeaning] = useState('')
  const wordLookup = useRef(0)
  const [loop, setLoop] = useState(false)
  const [pointA, setPointA] = useState<number | null>(null)
  const [pointB, setPointB] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const [dockHeight, setDockHeight] = useState(0)
  const playerDock = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLMediaElement>(null)
  useEffect(() => { if (!active) player.current?.pause(); else void reloadMine() }, [active])
  const selectToken = useRef(0)
  const lastPositionSave = useRef(0)

  async function reloadMine() {
    if (reloadTask.current) return reloadTask.current
    const uid = getStoredUserId()
    setLoggedIn(Boolean(uid))
    if (!uid) { setMine([]); return }
    const task = (async () => {
      setLoading(true)
      try {
        const cached = await readCachedMaterial<MediaItem[]>('index').catch(() => null)
        if (uid !== getStoredUserId()) return
        if (cached) setMine(cached)
        const items = await listMedia()
        if (uid !== getStoredUserId()) return
        setMine(items); setMessage('')
        await cacheMaterial('index', items).catch(() => undefined)
      } catch (error) {
        if (uid === getStoredUserId()) setMessage((error as Error).name === 'AbortError' ? '刷新超过 12 秒，已保留本机列表。可稍后重试。' : '素材刷新失败，已保留本机列表。请检查连接后重试。')
      } finally { setLoading(false) }
    })()
    reloadTask.current = task
    try { await task } finally { reloadTask.current = null }
  }
  useEffect(() => {
    void fetch(`${packBase}catalog.json`).then((response) => response.json()).then((data: { items: StarterItem[] }) => setStarter(data.items)).catch(() => setStarter([]))

  }, [])
  useEffect(() => {
    if (selected?.type !== 'mine' || (!['processing', 'queued-local', 'transcribing-local'].includes(selected.item.status) && selected.item.guideStatus !== 'processing')) return
    const timer = window.setInterval(() => { void getMedia(selected.item.id).then((item) => { setSelected({ type: 'mine', item }); if (item.status !== 'processing') void reloadMine() }).catch(() => undefined) }, 4000)
    return () => window.clearInterval(timer)
  }, [selected])

  useEffect(() => {
    if (!initialOrigin) return
    const token = ++selectToken.current
    void getMedia(initialOrigin.materialId).catch(() => readCachedMaterial<MediaItem>(initialOrigin.materialId)).then(async item => item ? await mergeLearning(item) : null).then((item) => {
      if (token !== selectToken.current || !item) return
      if (item.kind === 'book' && (initialOrigin.chapter !== undefined || initialOrigin.paragraph !== undefined)) item = { ...item, readingPosition: { chapter: initialOrigin.chapter || 0, paragraph: initialOrigin.paragraph || 0 } }
      else if (initialOrigin.timestamp !== undefined) item = { ...item, playbackPosition: initialOrigin.timestamp }
      setSelected({ type: 'mine', item })
    })
  }, [initialOrigin])
  const current = selected?.item
  const lines = useMemo(() => selected?.type === 'starter' ? selected.item.lines.map((line) => line.text) : selected?.item.segments?.length ? selected.item.segments.map((line) => line.text) : selected?.item.transcript.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean) || [], [selected])
  const selectedText = lines[lineIndex] || lines[0] || ''
  useEffect(() => { wordLookup.current++; setWord(''); setWordMeaning('') }, [selectedText])
  async function pickWord(value: string) {
    const token = ++wordLookup.current; setWord(value); setWordMeaning('查询中…')
    try { const meaning = await lookupZhGloss(value.toLowerCase().replace(/[^a-z'-]/g, '')); if (token === wordLookup.current) setWordMeaning(meaning || '本地词典暂未收录') } catch { if (token === wordLookup.current) setWordMeaning('词典暂未加载，可先记录') }
  }
  const exercises = selected?.type === 'mine' ? selected.item.exercises : []
  const exercise = exercises[exerciseIndex]
  const streamUrl = selected?.type === 'starter' ? `${packBase}${selected.item.audio}` : selected?.item.streamUrl ? `${apiBase}${selected.item.streamUrl}` : ''
  const kind = selected?.type === 'starter' ? 'audio' : selected?.item.kind
  useEffect(() => {
    const dock = playerDock.current
    if (!dock) { setDockHeight(0); return }
    const observer = new ResizeObserver(() => setDockHeight(Math.ceil(dock.getBoundingClientRect().height)))
    observer.observe(dock)
    return () => observer.disconnect()
  }, [selected?.item.id, streamUrl])
  function choose(next: Selection | null) {
    const token = ++selectToken.current
    setLineIndex(0); setExerciseIndex(0); setAnswerOpen(false); setLoop(false); setPointA(null); setPointB(null); setTime(0)
    if (next?.type === 'mine') {
      setMessage('正在打开素材…')
      void getMedia(next.item.id).catch(() => readCachedMaterial<MediaItem>(next.item.id)).then(async item => item ? await mergeLearning(item) : null).then((item) => {
        if (token !== selectToken.current) return
        if (!item || (item.kind === 'book' && !item.chapters?.length)) { setMessage('素材尚未缓存，请联网后打开一次'); return }
        void cacheMaterial(item.id, item); setSelected({ type: 'mine', item }); setMessage('')
      }).catch((error: Error) => setMessage(error.message))
    } else setSelected(next)
  }

  async function submitUpload() {
    if (!title.trim() || (!file && !transcript.trim())) return
    setBusy(true); setMessage('正在保存素材…')
    try {
      const kind: MediaItem['kind'] = file ? (file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name) ? 'video' : 'audio') : 'text'
      const item = await uploadMedia({ title: title.trim(), source: source.trim(), transcript: transcript.trim(), kind, file: file || undefined, level: estimateLevel(transcript), levelBasis: '文本估算／可调整' })
      await reloadMine(); choose({ type: 'mine', item }); setUploadOpen(false); setTitle(''); setSource(''); setTranscript(''); setFile(null)
      setMessage(item.status === 'queued-local' ? '已保存，等待电脑本机转写；请启动本地转写助手。' : item.status === 'processing' ? '正在转写并生成练习。' : item.status === 'uploaded' ? '已保存。添加原文或配置转写密钥后可生成练习。' : '已保存，练习已生成。')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  function onTimeUpdate() { const node = player.current; if (!node) return; if (loop && pointA !== null && pointB !== null && node.currentTime >= pointB) node.currentTime = pointA; setTime(node.currentTime); if (selected?.type === 'mine' && selected.item.segments?.length) { const index = selected.item.segments.findIndex((part) => node.currentTime >= part.start && node.currentTime < part.end); if (index >= 0) setLineIndex(index) } if (Date.now() - lastPositionSave.current > 15000) { lastPositionSave.current = Date.now(); savePlayback() } }
  function seekTo(seconds: number) { if (player.current) { player.current.currentTime = seconds; setTime(seconds); void player.current.play().catch(() => undefined) } }
  function savePlayback() { if (selected?.type === 'mine' && player.current) void saveLearning(selected.item, { playbackPosition: player.current.currentTime }).catch(() => undefined) }
  function resumePlayback() { if (selected?.type === 'mine' && player.current && selected.item.playbackPosition && selected.item.playbackPosition < player.current.duration) player.current.currentTime = selected.item.playbackPosition }

  const groups = mine.map(materialGroup)
  const purposes = [...new Set(groups.map(g => g.purpose))]
  const seriesOptions = [...new Set(groups.filter(g => !purpose || g.purpose === purpose).map(g => g.series))]
  const filtered = mine.filter((item) => (!purpose || materialGroup(item).purpose === purpose) && (!series || materialGroup(item).series === series) && (!level || (level === 'unknown' ? !item.level : item.level === level)) && (materialType === 'all' ? !['link', 'lesson'].includes(item.kind) : (materialType === 'lesson' ? item.kind === 'lesson' : materialType === 'link' ? item.kind === 'link' : materialType === 'course' ? Boolean(item.courseId) : materialType === 'book' ? item.kind === 'book' : item.kind !== 'book' && item.kind !== 'link' && item.kind !== 'lesson' && !item.courseId)) && `${item.title} ${item.source}`.toLowerCase().includes(query.toLowerCase()))
  filtered.sort((a, b) => materialType === 'lesson' && sort === 'title' ? (a.episode || 999) - (b.episode || 999) || a.title.localeCompare(b.title) : sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : sort === 'level' ? (a.level || 'Z').localeCompare(b.level || 'Z') || a.title.localeCompare(b.title, 'en', { numeric: true }) : a.title.localeCompare(b.title, 'en', { numeric: true }))
  const pages = Math.max(1, Math.ceil(filtered.length / 12)), activePage = Math.min(page, pages)
  const shown = filtered.slice((activePage - 1) * 12, activePage * 12)
  function turnPage(next: number) { setPage(next); document.querySelector('.redesign-workspace')?.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (selected?.type === 'mine' && selected.item.kind === 'book') return <BookReader item={selected.item} onBack={() => { choose(null); void reloadMine() }} onCapture={onCapture} onPractice={onPractice} />

  if (selected?.type === 'mine' && ['link', 'lesson'].includes(selected.item.kind)) return <LinkCollection key={selected.item.id} initial={selected.item} items={mine.filter(item => item.kind === selected.item.kind)} curated={selected.item.kind === 'lesson'} active={active} onBack={() => { choose(null); setMaterialType(selected.item.kind === 'lesson' ? 'lesson' : 'link'); void reloadMine() }} onChange={item => setMine(list => list.map(old => old.id === item.id ? item : old))} onCapture={onCapture} onPractice={onPractice} />

  return <div className="redesign-page media-page">
    {!selected && <header className="redesign-heading"><div><h1>素材库</h1><p>听一段，记一句，再试着说出来。</p></div><div className="material-header-actions"><button className="icon-action collection-entry" aria-label="收集链接" title="收集链接" onClick={() => { if (loggedIn) setCollectOpen(value => !value); else onSettings() }}><NavIcon name="link" /></button><button className="redesign-primary" onClick={() => { if (!loggedIn) { setMessage('先在设置中登录 NAS 账号，再上传私人素材。'); onSettings() } else setUploadOpen(true) }}><NavIcon name="plus" />导入</button></div></header>}
    {message && <p className="redesign-message" role="status">{message}</p>}
    {!selected ? <div className="media-library">
      {collectOpen && <LinkCollector onClose={() => setCollectOpen(false)} onDone={item => { setCollectOpen(false); void reloadMine(); choose({ type: 'mine', item }) }} />}
      <button className="redesign-secondary" onClick={() => { if (loggedIn) setBatchOpen(!batchOpen); else onSettings() }}>批量导入 / 电子书</button>
      {!['link', 'lesson'].includes(materialType) && <button className="course-entry" onClick={() => { const first = mine.filter((item) => item.courseId === 'family-album').sort((a, b) => (a.episode || 0) - (b.episode || 0))[0]; if (first) choose({ type: 'mine', item: first }); else { setMaterialType('course'); setMessage(loggedIn ? '正在同步课程素材，请稍后重试。' : '登录 NAS 后即可使用课程文稿、训练和私人笔记。') } }}><span><strong>走遍美国 · Family Album USA</strong><small>26 集 · A2–B1 · 文稿与练习</small></span><span>开始学习 →</span></button>}
      {batchOpen && <MaterialImport onClose={() => setBatchOpen(false)} onDone={() => void reloadMine()} />}
      <div className="library-controls"><button className="redesign-text-button" disabled={loading} onClick={() => void reloadMine()}>{loading ? '刷新中…' : '刷新素材'}</button><input className="redesign-search" type="search" name="material-search" autoComplete="off" data-lpignore="true" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="搜索素材标题或来源" aria-label="搜索素材" />
      <label>排序 <select aria-label="素材排序" value={sort} onChange={(e) => { setSort(e.target.value); localStorage.setItem('ec.material-sort', e.target.value); setPage(1) }}><option value="title">名称 A–Z / 集数</option><option value="newest">最近添加</option><option value="level">等级</option></select></label><div className="library-type-tabs">{[['all', '全部'], ['audio', '听力'], ['book', '阅读'], ['course', '课程'], ['lesson', '精选视频'], ['link', '我的收集']].map(([value, label]) => <button key={value} className={materialType === value ? 'active' : ''} onClick={() => { setMaterialType(value); setPurpose(''); setSeries(''); setPage(1) }}>{label}</button>)}</div>
      <div className="material-group-controls"><label>用途<select aria-label="素材用途" value={purpose} onChange={e => { setPurpose(e.target.value); setSeries(''); setPage(1) }}><option value="">全部用途</option>{purposes.map(p => <option key={p}>{p}</option>)}</select></label><label>节目 / 系列<select aria-label="节目或系列" value={series} onChange={e => { setSeries(e.target.value); setPage(1) }}><option value="">全部节目 / 系列</option>{seriesOptions.map(p => <option key={p}>{p}</option>)}</select></label>{(query || purpose || series || level) && <button className="chip" onClick={() => { setQuery(''); setPurpose(''); setSeries(''); setLevel(''); setPage(1) }}>清除筛选</button>}</div>
      <div className="level-filters" aria-label="素材等级筛选">{['', ...LEVELS, 'unknown'].map((value) => <button key={value} className={level === value ? 'active' : ''} onClick={() => { setLevel(value); setPage(1) }}>{value === '' ? '全部等级' : value === 'unknown' ? '待评估' : value}</button>)}</div>
      <div className="library-page-bar"><span>{filtered.length} 份 · {activePage} / {pages} 页</span><div><button aria-label="上一页素材" disabled={activePage === 1} onClick={() => turnPage(activePage - 1)}>←</button><button aria-label="下一页素材" disabled={activePage === pages} onClick={() => turnPage(activePage + 1)}>→</button></div></div></div>
      {loading && mine.length === 0 && <p role="status">正在读取素材列表…</p>}
      <div className="library-grid">
      {(loggedIn || mine.length > 0) ? shown.map((item) => <button type="button" className={`media-list-row${item.kind === 'book' ? ' library-book' : ''}`} key={item.id} onClick={() => choose({ type: 'mine', item })}>{item.kind === 'book' && <StoryCover title={item.title} author={item.author} />}<span className="media-symbol"><NavIcon name={item.kind === 'lesson' ? 'play' : item.kind === 'link' ? 'link' : item.kind === 'book' ? 'book' : item.kind === 'video' ? 'play' : item.kind === 'audio' ? 'audio' : 'dictionary'} /></span><span><span className="library-kind">{item.kind === 'lesson' ? '精选视频' : item.kind === 'link' ? '我的收集' : item.kind === 'book' ? '阅读' : item.kind === 'video' ? '视频' : '听力'}</span><strong>{item.title}</strong>{(item.kind !== 'link' || item.level) && <span className="level-badge">{item.level || '待评估'}{item.level ? ' · 参考' : ''}</span>}<small>{materialGroup(item).purpose} · {materialGroup(item).series} · {item.source || '私人素材'}{item.kind === 'lesson' ? ' · 双语字幕' : item.kind !== 'link' && <> · {item.status === 'ready' ? `${item.exerciseCount ?? item.exercises.length} 张练习卡` : item.status === 'queued-local' ? '等本机转写' : item.status === 'transcribing-local' ? '本机转写中' : item.status === 'processing' ? '正在生成' : '待生成'}</>}</small></span><span className="media-arrow">›</span></button>) : <p className="media-empty">登录 NAS 账号后，手机和电脑可以使用同一份私人素材。</p>}
      </div>
      {filtered.length === 0 && mine.length > 0 && <p className="media-empty">没有符合条件的素材，可以切换等级或清空搜索。</p>}
      {loggedIn && !loading && mine.length === 0 && <p className="media-empty">还没有上传素材。音频、视频和文字都可以放在这里。</p>}
      <div className="library-page-bottom"><button className="redesign-secondary" disabled={activePage === 1} onClick={() => turnPage(activePage - 1)}>上一页</button><span>{activePage} / {pages}</span><button className="redesign-secondary" disabled={activePage === pages} onClick={() => turnPage(activePage + 1)}>下一页</button></div>
      <details className="library-starters"><summary>内置听说素材 · ELLLO {starter.length} 段</summary><div className="library-grid">
      {starter.filter(() => !level || level === 'A2').filter((item) => `${item.title} ${item.titleZh}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button type="button" className="media-list-row" key={item.id} onClick={() => choose({ type: 'starter', item })}><span className="media-symbol"><NavIcon name="audio" /></span><span><strong>{item.titleZh}</strong><span className="level-badge">A2 · 来源参考</span><small>{item.title} · {stamp(item.durationSeconds)}</small></span><span className="media-arrow">›</span></button>)}
      </div><p className="muted tiny">内置素材保留原课来源，用于教育学习与非商业使用。</p></details>
      <details className="material-help"><summary>播放与转写说明</summary><p>手机可上传和发起任务；电脑转写需电脑助手在线。云端转写需设置转写密钥。已有时间字幕可点句定位。移动网络首次播放受 NAS 上行和线路影响。</p></details><p className="muted tiny">等级为文本估算或来源参考，可在素材内调整。</p>
    </div> : <div className="media-reader" style={{ '--media-player-height': `${dockHeight}px` } as React.CSSProperties}>
      <button className="redesign-text-button" onClick={() => choose(null)}>← 返回素材库</button>
      <div className="media-reader-head"><div><span className="redesign-tag">{selected.type === 'starter' ? '内置素材' : '我的素材'}</span><h2>{selected.type === 'starter' ? selected.item.titleZh : selected.item.title}</h2><p>{selected.type === 'starter' ? selected.item.provider : selected.item.source || '私人素材'}</p></div>{selected.type === 'starter' && <a href={selected.item.sourceUrl} target="_blank" rel="noreferrer">查看原课 ↗</a>}</div>
      <label className="material-level-edit">素材等级 <select value={selected.type === 'mine' ? selected.item.level || '' : 'A2'} disabled={selected.type === 'starter'} onChange={(event) => { if (selected.type === 'mine') void patchMedia(selected.item.id, { level: event.target.value }).then((item) => { setSelected({ type: 'mine', item }); void reloadMine() }).catch((error: Error) => setMessage(error.message)) }}><option value="">待评估</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select> <small>参考等级，可按实际体验调整</small></label>
      {streamUrl && <div ref={playerDock} className="media-player-dock" role="region" aria-label="固定播放区">{kind === 'video' ? <video key={selected.item.id} ref={player as React.RefObject<HTMLVideoElement>} className="media-video" controls playsInline preload="metadata" src={streamUrl} onTimeUpdate={onTimeUpdate} onPause={savePlayback} onLoadedMetadata={resumePlayback} /> : <audio key={selected.item.id} ref={player as React.RefObject<HTMLAudioElement>} className="media-audio" controls preload="metadata" src={streamUrl} onTimeUpdate={onTimeUpdate} onPause={savePlayback} onLoadedMetadata={resumePlayback} />}</div>}
      <div className="media-reader-layout"><div>
        {streamUrl && <div className="media-loop"><span>播放位置 {stamp(time)}</span><button onClick={() => setPointA(player.current?.currentTime ?? 0)}>A 点 {pointA === null ? '' : stamp(pointA)}</button><button onClick={() => setPointB(player.current?.currentTime ?? 0)}>B 点 {pointB === null ? '' : stamp(pointB)}</button><button className={loop ? 'active' : ''} disabled={pointA === null || pointB === null || pointB <= pointA} onClick={() => setLoop(!loop)}>{loop ? '停止循环' : '区间循环'}</button><select aria-label="播放速度" defaultValue="1" onChange={(event) => { if (player.current) player.current.playbackRate = Number(event.target.value) }}><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></div>}
<section className="media-karaoke" aria-label="逐词跟读"><p className="media-selected-text media-word-line">{selectedText ? <TimedWords text={selectedText} words={selected.type === 'mine' ? selected.item.segments?.[lineIndex]?.words : undefined} time={time} selected={word} onWord={value => void pickWord(value)} /> : '选择原文中的一句，开始跟读或记录。'}</p>{word && <div className="link-word-meaning"><strong>{word}</strong><span>{wordMeaning}</span><button className="icon-action" aria-label="记录这个单词" onClick={() => onCapture({ text: word, context: selectedText, category: kind === 'video' ? '影视剧' : '播客', source: current?.title, origin: selected.type === 'mine' ? { materialId: selected.item.id, timestamp: selected.item.segments?.[lineIndex]?.start } : undefined })}><NavIcon name="bookmark" /></button></div>}<div className="link-learning-actions"><button className="icon-action" aria-label="重听当前句" title="重听当前句" disabled={!selectedText} onClick={() => { if (selected.type === 'mine' && selected.item.segments?.[lineIndex]) seekTo(selected.item.segments[lineIndex].start) }}><NavIcon name="review" /></button><button className="icon-action" aria-label="下一句听力" title="下一句" disabled={lineIndex >= lines.length - 1} onClick={() => { const next = Math.min(lines.length - 1, lineIndex + 1); setLineIndex(next); if (selected.type === 'mine' && selected.item.segments?.[next]) seekTo(selected.item.segments[next].start) }}><NavIcon name="next" /></button><button className="icon-action" aria-label="用当前句开口练" title="开口练" disabled={!selectedText} onClick={() => onPractice(selectedText, current?.title || '')}><NavIcon name="mic" /></button></div></section>
        {selected.type === 'mine' && ['queued-local', 'transcribing-local'].includes(selected.item.status) && <p className="redesign-message">{selected.item.status === 'queued-local' ? '手机可以提交任务；识别由运行转写助手的电脑完成，电脑关闭时等待。' : '电脑正在转写，完成后自动更新原文和练习。'}</p>}
        {selected.type === 'mine' && selected.item.status === 'failed' && <p className="redesign-message">{selected.item.error}</p>}
        {selected.type === 'mine' && !selected.item.courseId && !['processing', 'queued-local', 'transcribing-local'].includes(selected.item.status) && <button className="redesign-secondary" onClick={() => { void processMedia(selected.item.id).then((item) => { setSelected({ type: 'mine', item }); setMessage('正在生成练习…') }).catch((error: Error) => setMessage(error.message)) }}>重建练习卡（无原文时云端转写）</button>}
        {selected.type === 'mine' && !selected.item.segments?.length && streamUrl && <button className="redesign-secondary" disabled={selected.item.status === 'processing'} onClick={() => { void processMedia(selected.item.id, true).then(item => { setSelected({ type: 'mine', item }); setMessage('正在云端生成时间字幕，音频将发送给已配置的转写服务。') }).catch((e: Error) => setMessage(e.message)) }}>云端生成时间字幕（需转写密钥）</button>}
        {selected.type === 'mine' && !selected.item.courseId && <button className="redesign-secondary" disabled={['processing', 'queued-local', 'transcribing-local'].includes(selected.item.status)} onClick={() => { void authorizedApiFetch(`/api/media/${selected.item.id}/local`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(async (res) => { const data = await res.json(); if (!res.ok) throw Error(data.message); setSelected({ type: 'mine', item: data.item }); setMessage('已加入本机队列。请在电脑上启动本地转写助手；电脑离线时任务会等待。') }).catch((error: Error) => setMessage(error.message)) }}>交给电脑转写</button>}
        {selected.type === 'mine' && selected.item.courseId && <label className="course-choose">切换集数<select aria-label="选择课程集数" value={selected.item.id} onChange={(event) => { const item = mine.find((entry) => entry.id === event.target.value); if (item) choose({ type: 'mine', item }) }}>{mine.filter((entry) => entry.courseId === selected.item.courseId).sort((a, b) => (a.episode || 0) - (b.episode || 0)).map((entry) => <option key={entry.id} value={entry.id}>第 {entry.episode} 集 · {entry.title}</option>)}</select></label>}
        {selected.type === 'mine' && <button className="redesign-text-button media-study-jump" onClick={() => document.querySelector('.material-study')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>重点 / 笔记 / 理解练习 ↓</button>}
        <div className="media-section-head"><h3>原文</h3><span>{lines.length} 段</span>{selected.type === 'mine' && Boolean(selected.item.segments?.length) && <button className="redesign-text-button" onClick={() => document.querySelector('.media-transcript .playing')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>定位当前句</button>}</div>
        {selected.type === 'mine' && streamUrl && !selected.item.segments?.length && <p className="muted tiny">当前原文没有时间轴。点击「本机转写」后，可生成逐句定位字幕。</p>}
        {selected.type === 'mine' && selected.item.segments?.[lineIndex] && <button className="redesign-secondary" onClick={() => { const part = selected.item.segments![lineIndex]; setPointA(part.start); setPointB(part.end); setLoop(true); if (player.current) { player.current.currentTime = part.start; void player.current.play().catch(() => undefined) } }}>循环这一句</button>}
        <div className="media-transcript" role="region" aria-label="逐句原文" tabIndex={0}>{lines.length ? lines.map((line, index) => {
          const part = selected.type === 'mine' ? selected.item.segments?.[index] : undefined
          const active = Boolean(part && time >= part.start && time < part.end)
          return <button key={`${index}-${line.slice(0, 8)}`} aria-current={active ? 'true' : undefined} className={`${lineIndex === index ? 'transcript-row selected' : 'transcript-row'}${active ? ' playing' : ''}`} onClick={() => { setLineIndex(index); if (part && player.current) { player.current.currentTime = part.start; void player.current.play().catch(() => undefined) } }}><span className="transcript-time">{part ? stamp(part.start) : String(index + 1).padStart(2, '0')}</span><span className="transcript-text">{line}</span></button>
        }) : <p className="media-empty">{selected.type === 'mine' && selected.item.status === 'processing' ? '正在生成原文，请稍候。' : '暂无原文。可上传同名 SRT/VTT，或交给电脑生成时间字幕。'}</p>}</div>
        {selected.type === 'mine' && <details className="media-transcript-editor"><summary>修改 / 补充原文</summary><textarea defaultValue={selected.item.transcript} id="media-transcript-edit" rows={8} /><button className="redesign-secondary" onClick={() => { const value = (document.getElementById('media-transcript-edit') as HTMLTextAreaElement).value; void updateMediaTranscript(selected.item.id, value).then((item) => { setSelected({ type: 'mine', item }); void reloadMine(); setMessage('原文和练习已更新。') }).catch((error: Error) => setMessage(error.message)) }}>保存原文并更新练习</button></details>}
      </div><aside className="media-practice-side"><p className="redesign-eyebrow">选中的一句</p><div className="media-side-actions"><button className="redesign-primary" disabled={!selectedText} onClick={() => onCapture({ text: selectedText, context: selectedText, category: selected.type === 'starter' ? '播客' : kind === 'video' ? '影视剧' : '播客', source: current?.title, origin: selected.type === 'mine' ? { materialId: selected.item.id, timestamp: selected.item.segments?.[lineIndex]?.start } : undefined, sourceDetail: selected.type === 'starter' ? selected.item.title : selected.item.segments?.[lineIndex] ? stamp(selected.item.segments[lineIndex].start) : undefined })}>＋ 收藏词句</button><button className="redesign-secondary" disabled={!selectedText} onClick={() => onPractice(selectedText, current?.title || '')}>跟读这句</button></div>
        {selected.type === 'mine' && <MaterialStudy key={selected.item.id} item={selected.item} quote={selectedText} time={selected.item.segments?.[lineIndex]?.start ?? time} onChange={(item) => { setSelected((current) => current?.type === 'mine' && current.item.id === item.id ? { type: 'mine', item } : current); setMine((list) => list.map((old) => old.id === item.id ? item : old)) }} onSeek={seekTo} onPractice={onPractice} />}
        <div className="media-section-head"><h3>练习卡</h3><span>{exercises.length} 张</span></div>
        {exercise ? <div className="media-exercise"><span className="redesign-tag">{exercise.kind === 'listen' ? '听写填空' : exercise.kind === 'shadow' ? '跟读' : '复述'}</span><p>{exercise.prompt}</p>{answerOpen && <p className="media-answer">{exercise.answer || exercise.reference}</p>}<div><button onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? '收起参考' : '查看参考'}</button><button onClick={() => { setExerciseIndex((exerciseIndex + 1) % exercises.length); setAnswerOpen(false) }}>下一张 →</button></div></div> : <p className="media-empty">添加原文后会自动生成练习卡。</p>}
      </aside></div>
    </div>}
    {uploadOpen && <div className="redesign-overlay" onClick={() => setUploadOpen(false)}><div className="redesign-sheet" role="dialog" aria-modal="true" aria-label="导入素材" onClick={(event) => event.stopPropagation()}><div className="redesign-sheet-head"><h2>导入练习素材</h2><button onClick={() => setUploadOpen(false)} aria-label="关闭">✕</button></div><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：周末出行对话" /></label><label>音频或视频（可选）<input type="file" accept="audio/*,video/mp4,video/quicktime,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mov" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label>来源（可选）<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="例如：自己的课程录音" /></label><label>原文（可选；有原文可立即生成练习）<textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="粘贴逐句原文；没有原文时可用 AI 转写" /></label><p className="muted tiny">文件保存在 NAS。无文稿时默认等待电脑本机转写；配置 DeepSeek 后，原文会用于整理本篇重点和理解练习。</p><button className="redesign-primary" disabled={busy || !title.trim() || (!file && !transcript.trim())} onClick={() => void submitUpload()}>{busy ? '正在上传…' : '保存并生成练习'}</button></div></div>}
  </div>
}
