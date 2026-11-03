import { useEffect, useRef, useState } from 'react'
import { getCurrentUser } from '../lib/sync'
import { getMedia, listMedia, processMedia, updateMediaTranscript, uploadMedia } from '../lib/media'
import type { MediaItem } from '../lib/media'

interface StarterItem { id: string; title: string; titleZh: string; provider: string; sourceUrl: string; audio: string; durationSeconds: number; lines: Array<{ text: string }> }
type Selection = { type: 'starter'; item: StarterItem } | { type: 'mine'; item: MediaItem }
interface Props {
  onCapture: (seed: { text: string; context?: string; category?: string; source?: string; sourceDetail?: string }) => void
  onPractice: (text: string, title: string) => void
  onSettings: () => void
}
const packBase = `${(import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''}/practice/starter-20261026/`
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function MaterialsView({ onCapture, onPractice, onSettings }: Props) {
  const [starter, setStarter] = useState<StarterItem[]>([])
  const [mine, setMine] = useState<MediaItem[]>([])
  const [loggedIn, setLoggedIn] = useState(false)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [transcript, setTranscript] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [loop, setLoop] = useState(false)
  const [pointA, setPointA] = useState<number | null>(null)
  const [pointB, setPointB] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const player = useRef<HTMLMediaElement>(null)

  async function reloadMine() { try { setMine(await listMedia()) } catch (error) { setMessage((error as Error).message) } }
  useEffect(() => {
    void fetch(`${packBase}catalog.json`).then((response) => response.json()).then((data: { items: StarterItem[] }) => setStarter(data.items)).catch(() => setStarter([]))
    void getCurrentUser().then((user) => { setLoggedIn(Boolean(user)); if (user) void reloadMine() })
  }, [])
  useEffect(() => {
    if (selected?.type !== 'mine' || selected.item.status !== 'processing') return
    const timer = window.setInterval(() => { void getMedia(selected.item.id).then((item) => { setSelected({ type: 'mine', item }); if (item.status !== 'processing') void reloadMine() }).catch(() => undefined) }, 4000)
    return () => window.clearInterval(timer)
  }, [selected])

  const current = selected?.item
  const lines = selected?.type === 'starter' ? selected.item.lines.map((line) => line.text) : selected?.item.transcript.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean) || []
  const selectedText = lines[lineIndex] || lines[0] || ''
  const exercises = selected?.type === 'mine' ? selected.item.exercises : []
  const exercise = exercises[exerciseIndex]
  const streamUrl = selected?.type === 'starter' ? `${packBase}${selected.item.audio}` : selected?.item.streamUrl ? `${apiBase}${selected.item.streamUrl}` : ''
  const kind = selected?.type === 'starter' ? 'audio' : selected?.item.kind
  function choose(next: Selection | null) { setSelected(next); setLineIndex(0); setExerciseIndex(0); setAnswerOpen(false); setLoop(false); setPointA(null); setPointB(null); setTime(0) }

  async function submitUpload() {
    if (!title.trim() || (!file && !transcript.trim())) return
    setBusy(true); setMessage('正在保存素材…')
    try {
      const kind: MediaItem['kind'] = file ? (file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name) ? 'video' : 'audio') : 'text'
      const item = await uploadMedia({ title: title.trim(), source: source.trim(), transcript: transcript.trim(), kind, file: file || undefined })
      await reloadMine(); choose({ type: 'mine', item }); setUploadOpen(false); setTitle(''); setSource(''); setTranscript(''); setFile(null)
      setMessage(item.status === 'processing' ? '正在转写并生成练习。' : item.status === 'uploaded' ? '已保存。添加原文或配置转写密钥后可生成练习。' : '已保存，练习已生成。')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  function onTimeUpdate() { const node = player.current; if (!node) return; if (loop && pointA !== null && pointB !== null && node.currentTime >= pointB) node.currentTime = pointA; setTime(node.currentTime) }

  return <div className="redesign-page media-page">
    <header className="redesign-heading"><div><p className="redesign-eyebrow">LISTEN & SPEAK</p><h1>素材库</h1><p>听一段，记一句，再试着说出来。</p></div><button className="redesign-primary" onClick={() => { if (!loggedIn) { setMessage('先在设置中登录 NAS 账号，再上传私人素材。'); onSettings() } else setUploadOpen(true) }}>＋ 导入素材</button></header>
    {message && <p className="redesign-message" role="status">{message}</p>}
    {!selected ? <div className="media-library">
      <input className="redesign-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材标题或来源" aria-label="搜索素材" />
      <div className="media-section-head"><h2>我的素材</h2><span>{mine.length} 份</span></div>
      {loggedIn ? mine.filter((item) => `${item.title} ${item.source}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button type="button" className="media-list-row" key={item.id} onClick={() => choose({ type: 'mine', item })}><span className="media-symbol">{item.kind === 'video' ? '▶' : item.kind === 'audio' ? '♫' : '文'}</span><span><strong>{item.title}</strong><small>{item.source || '私人素材'} · {item.status === 'ready' ? `${item.exercises.length} 张练习卡` : item.status === 'processing' ? '正在生成' : '待生成'}</small></span><span className="media-arrow">›</span></button>) : <p className="media-empty">登录 NAS 账号后，手机和电脑可以使用同一份私人素材。</p>}
      {loggedIn && mine.length === 0 && <p className="media-empty">还没有上传素材。音频、视频和文字都可以放在这里。</p>}
      <div className="media-section-head"><h2>内置听说素材</h2><span>ELLLO · {starter.length} 段</span></div>
      {starter.filter((item) => `${item.title} ${item.titleZh}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button type="button" className="media-list-row" key={item.id} onClick={() => choose({ type: 'starter', item })}><span className="media-symbol">♫</span><span><strong>{item.titleZh}</strong><small>{item.title} · {stamp(item.durationSeconds)}</small></span><span className="media-arrow">›</span></button>)}
      <p className="muted tiny">内置素材保留原课来源，用于教育学习与非商业使用。</p>
    </div> : <div className="media-reader">
      <button className="redesign-text-button" onClick={() => choose(null)}>← 返回素材库</button>
      <div className="media-reader-head"><div><span className="redesign-tag">{selected.type === 'starter' ? '内置素材' : '我的素材'}</span><h2>{selected.type === 'starter' ? selected.item.titleZh : selected.item.title}</h2><p>{selected.type === 'starter' ? selected.item.provider : selected.item.source || '私人素材'}</p></div>{selected.type === 'starter' && <a href={selected.item.sourceUrl} target="_blank" rel="noreferrer">查看原课 ↗</a>}</div>
      <div className="media-reader-layout"><div>
        {streamUrl && (kind === 'video' ? <video ref={player as React.RefObject<HTMLVideoElement>} className="media-video" controls src={streamUrl} onTimeUpdate={onTimeUpdate} /> : <audio ref={player as React.RefObject<HTMLAudioElement>} className="media-audio" controls src={streamUrl} onTimeUpdate={onTimeUpdate} />)}
        {streamUrl && <div className="media-loop"><span>播放位置 {stamp(time)}</span><button onClick={() => setPointA(player.current?.currentTime ?? 0)}>A 点 {pointA === null ? '' : stamp(pointA)}</button><button onClick={() => setPointB(player.current?.currentTime ?? 0)}>B 点 {pointB === null ? '' : stamp(pointB)}</button><button className={loop ? 'active' : ''} disabled={pointA === null || pointB === null || pointB <= pointA} onClick={() => setLoop(!loop)}>{loop ? '停止循环' : '区间循环'}</button><select aria-label="播放速度" defaultValue="1" onChange={(event) => { if (player.current) player.current.playbackRate = Number(event.target.value) }}><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></div>}
        {selected.type === 'mine' && selected.item.status === 'failed' && <p className="redesign-message">{selected.item.error}</p>}
        {selected.type === 'mine' && selected.item.status !== 'processing' && <button className="redesign-secondary" onClick={() => { void processMedia(selected.item.id).then((item) => { setSelected({ type: 'mine', item }); setMessage('正在生成练习…') }).catch((error: Error) => setMessage(error.message)) }}>重新生成练习 / 转写</button>}
        <div className="media-section-head"><h3>原文</h3><span>{lines.length} 段</span></div>
        {lines.length ? lines.map((line, index) => <button key={`${index}-${line.slice(0, 8)}`} className={lineIndex === index ? 'transcript-row selected' : 'transcript-row'} onClick={() => setLineIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span>{line}</button>) : <p className="media-empty">{selected.type === 'mine' && selected.item.status === 'processing' ? '正在生成原文，请稍候。' : '暂无原文。可补充文字或使用自动转写。'}</p>}
        {selected.type === 'mine' && <details className="media-transcript-editor"><summary>修改 / 补充原文</summary><textarea defaultValue={selected.item.transcript} id="media-transcript-edit" rows={8} /><button className="redesign-secondary" onClick={() => { const value = (document.getElementById('media-transcript-edit') as HTMLTextAreaElement).value; void updateMediaTranscript(selected.item.id, value).then((item) => { setSelected({ type: 'mine', item }); void reloadMine(); setMessage('原文和练习已更新。') }).catch((error: Error) => setMessage(error.message)) }}>保存原文并更新练习</button></details>}
      </div><aside className="media-practice-side"><p className="redesign-eyebrow">选中的一句</p><p className="media-selected-text">{selectedText || '选择原文中的一句，开始跟读或记录。'}</p><div className="media-side-actions"><button className="redesign-primary" disabled={!selectedText} onClick={() => onCapture({ text: selectedText, context: selectedText, category: selected.type === 'starter' ? '播客' : kind === 'video' ? '影视剧' : '播客', source: current?.title, sourceDetail: selected.type === 'starter' ? selected.item.title : undefined })}>＋ 收藏词句</button><button className="redesign-secondary" disabled={!selectedText} onClick={() => onPractice(selectedText, current?.title || '')}>跟读这句</button></div>
        <div className="media-section-head"><h3>练习卡</h3><span>{exercises.length} 张</span></div>
        {exercise ? <div className="media-exercise"><span className="redesign-tag">{exercise.kind === 'listen' ? '听写填空' : exercise.kind === 'shadow' ? '跟读' : '复述'}</span><p>{exercise.prompt}</p>{answerOpen && <p className="media-answer">{exercise.answer || exercise.reference}</p>}<div><button onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? '收起参考' : '查看参考'}</button><button onClick={() => { setExerciseIndex((exerciseIndex + 1) % exercises.length); setAnswerOpen(false) }}>下一张 →</button></div></div> : <p className="media-empty">添加原文后会自动生成练习卡。</p>}
      </aside></div>
    </div>}
    {uploadOpen && <div className="redesign-overlay" onClick={() => setUploadOpen(false)}><div className="redesign-sheet" role="dialog" aria-modal="true" aria-label="导入素材" onClick={(event) => event.stopPropagation()}><div className="redesign-sheet-head"><h2>导入练习素材</h2><button onClick={() => setUploadOpen(false)} aria-label="关闭">✕</button></div><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：周末出行对话" /></label><label>音频或视频（可选）<input type="file" accept="audio/*,video/mp4,video/quicktime,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mov" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label>来源（可选）<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="例如：自己的课程录音" /></label><label>原文（可选；有原文可立即生成练习）<textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="粘贴逐句原文；没有原文时可用 AI 转写" /></label><p className="muted tiny">文件保存在 NAS。只有你主动触发转写时，提取的音频才会发送给转写服务。</p><button className="redesign-primary" disabled={busy || !title.trim() || (!file && !transcript.trim())} onClick={() => void submitUpload()}>{busy ? '正在上传…' : '保存并生成练习'}</button></div></div>}
  </div>
}
