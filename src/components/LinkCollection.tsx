import { saveLearning, mergeLearning } from '../lib/learningProgress'
import { useEffect, useRef, useState } from 'react'
import { describeLink } from '../lib/links'
import { getMedia, patchMedia, uploadMedia, type MediaItem, type TimedSegment } from '../lib/media'
import { cacheMaterial, parseTimedTranscript, readCachedMaterial } from '../lib/books'
import { lookupZhGloss } from '../lib/zhGloss'
import { NavIcon } from './NavIcon'
import { YouTubePlayer } from './YouTubePlayer'
import { PreparedVideo } from './PreparedVideo'
import { TimedWords } from './TimedWords'
import { MaterialStudy } from './MaterialStudy'

interface CaptureSeed { text: string; context?: string; category?: string; source?: string; sourceDetail?: string; origin?: { materialId: string; timestamp?: number } }
export function LinkCollector({ onDone, onClose }: { onDone: (item: MediaItem) => void; onClose: () => void }) {
  const [url, setUrl] = useState(''), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const info = describeLink(url)
  async function save() {
    if (!info || busy) return
    setBusy(true); setError('')
    try { onDone(await uploadMedia({ kind: 'link', title: title.trim() || `${info.provider}${info.videoId ? ' · ' + info.videoId : info.host === info.provider ? '' : ' · ' + info.host}`, source: info.provider, sourceUrl: info.url, transcript: '' })) } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <form className="link-collector" onSubmit={(event) => { event.preventDefault(); void save() }}><div className="link-collector-heading"><h2><NavIcon name="link" />收集链接</h2><button className="icon-action" type="button" aria-label="关闭收集" onClick={onClose}><NavIcon name="close" /></button></div><input autoFocus type="url" required aria-label="资源链接" placeholder="粘贴 YouTube、播客或网页链接" value={url} onChange={(event) => { setUrl(event.target.value); setError('') }} /><input aria-label="收集标题" placeholder="标题（可选）" maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /><div className="link-collector-footer"><span className="muted tiny">{info?.provider || (url ? '请检查链接' : '保留原链接')}</span><button type="submit" className="redesign-primary" disabled={!info || busy}><NavIcon name="bookmark" />{busy ? '保存中…' : '收集'}</button></div>{error && <p role="alert">{error}</p>}</form>
}

export function LinkCollection({ initial, items, active, curated = false, onBack, onChange, onCapture, onPractice }: { initial: MediaItem; items: MediaItem[]; active: boolean; curated?: boolean; onBack: () => void; onChange: (item: MediaItem) => void; onCapture: (seed: CaptureSeed) => void; onPractice: (text: string, title: string) => void }) {
  const ordered = [initial, ...items.filter(item => item.id !== initial.id)]
  const [current, setCurrent] = useState(initial.id)
  const feed = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!feed.current) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio > .55).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (entry) setCurrent((entry.target as HTMLElement).dataset.linkId || initial.id)
    }, { root: feed.current, threshold: [.55, .75] })
    feed.current.querySelectorAll('[data-link-id]').forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [items.length, initial.id])
  return <div className="link-collection"><header className="link-feed-heading"><button className="redesign-text-button" onClick={onBack}>← {curated ? '精选视频' : '我的收集'}</button><span><NavIcon name="bookmark" />{ordered.length} 份</span></header><div ref={feed} className="link-feed" aria-label="收集资源流">{ordered.map(item => <article key={item.id} data-link-id={item.id} className="link-feed-item"><LinkCard initial={item} active={active && current === item.id} learning={curated} onChange={onChange} onCapture={onCapture} onPractice={onPractice} /></article>)}</div></div>
}

function LinkCard({ initial, active, learning, onChange, onCapture, onPractice }: { initial: MediaItem; active: boolean; learning: boolean; onChange: (item: MediaItem) => void; onCapture: (seed: CaptureSeed) => void; onPractice: (text: string, title: string) => void }) {
  const [showTranslation, setShowTranslation] = useState(true)
  const [item, setItem] = useState(initial), [time, setTime] = useState(initial.playbackPosition || 0), [cue, setCue] = useState(0), [seek, setSeek] = useState<{ time: number; key: number }>(), [word, setWord] = useState(''), [meaning, setMeaning] = useState(''), [message, setMessage] = useState(''), [editor, setEditor] = useState(false), [notes, setNotes] = useState(false), [text, setText] = useState(''), [saving, setSaving] = useState(false)
  const info = describeLink(item.sourceUrl || '')
  const initialRef = useRef(initial); initialRef.current = initial
  const lastSave = useRef(0), latestPosition = useRef(time), lookup = useRef(0)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void getMedia(initial.id).catch(() => readCachedMaterial<MediaItem>(initial.id)).then(async value => value ? await mergeLearning(value) : null).then(value => { if (value && !cancelled) { setItem(value); void cacheMaterial(value.id, value) } }).catch((error: Error) => setMessage(error.message))
    return () => { cancelled = true; if (latestPosition.current > 0) void saveLearning(initialRef.current, { playbackPosition: latestPosition.current }).catch(() => undefined) }
  }, [initial.id, active])
  function changed(next: MediaItem) { setItem(next); onChange(next); void cacheMaterial(next.id, next) }
  const segments = item.segments || []
  const line = segments[cue]?.text || item.transcript?.split(/\n+|(?<=[.!?])\s+/).filter(Boolean)[cue] || ''
  const count = segments.length || item.transcript?.split(/\n+|(?<=[.!?])\s+/).filter(Boolean).length || 0
  function jump(index: number) { setCue(index); setWord(''); setMeaning(''); if (segments[index]) setSeek({ time: segments[index].start, key: Date.now() }) }
  async function selectWord(value: string) {
    const token = ++lookup.current
    setWord(value); setMeaning('查询中…')
    try { const definition = await lookupZhGloss(value.toLowerCase()); if (lookup.current === token) setMeaning(definition || '本地词典暂未收录') } catch { if (lookup.current === token) setMeaning('可先记录，稍后再查') }
  }
  async function saveTranscript(value: string) {
    setSaving(true); setMessage('')
    try { let parts: TimedSegment[] = parseTimedTranscript(value); if (value.trim().startsWith('{')) { const data = JSON.parse(value) as { segments?: TimedSegment[] }; if (!Array.isArray(data.segments)) throw Error('JSON 中没有字幕时间轴'); parts = data.segments } changed(await patchMedia(item.id, { transcript: parts.length ? parts.map(part => part.text).join('\n') : value, segments: parts })); setEditor(false); setCue(0) } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  function capture() { if (word || line) onCapture({ text: word || line, context: line, category: info?.provider === 'YouTube' ? 'YouTube' : '其他', source: item.title, sourceDetail: item.sourceUrl, origin: { materialId: item.id, timestamp: segments[cue]?.start ?? time } }) }
  return <div className="link-learning-card"><div className="link-card-heading"><div><span className="link-provider">{learning ? `精选 · ${item.level || '参考等级'}` : '我的收集'} · {learning ? item.source : info?.provider || '网页'}</span><h2>{item.title}</h2></div><a className="icon-action" title="打开原网页" aria-label="打开原网页" href={info?.url} target="_blank" rel="noreferrer"><NavIcon name="external" /></a></div>
    {learning && item.streamUrl ? <PreparedVideo src={`${(import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''}${item.streamUrl}`} active={active} start={item.playbackPosition ?? item.segments?.[0]?.start ?? 0} seek={seek} onProgress={position => { setTime(position); latestPosition.current = position; const index = segments.findIndex(part => position >= part.start && position < part.end); if (index >= 0) setCue(index); if (position > 0 && Date.now() - lastSave.current > 15000) { lastSave.current = Date.now(); void saveLearning(item, { playbackPosition: position }).catch(() => undefined) } }} /> : info?.videoId ? <YouTubePlayer videoId={info.videoId} active={active} start={item.playbackPosition || info.start} seek={seek} onProgress={(position) => { setTime(position); latestPosition.current = position; const index = segments.findIndex(part => position >= part.start && position < part.end); if (index >= 0) setCue(index); if (position > 0 && Date.now() - lastSave.current > 15000) { lastSave.current = Date.now(); void saveLearning(item, { playbackPosition: position }).catch(() => undefined) } }} /> : <a className="link-web-open" href={info?.url} target="_blank" rel="noreferrer"><NavIcon name="link" /><span>{info?.host}</span><NavIcon name="external" /></a>}    {learning && <section className="link-sentence" aria-label="视频语句与词汇">{line ? <><div className="link-sentence-head"><button className="translation-toggle" aria-label="显示中文对照" aria-pressed={showTranslation} onClick={() => setShowTranslation(value => !value)}>中</button><span>{cue + 1} / {count}</span><progress className="learning-progress" value={cue + 1} max={count} aria-label="语句进度" /></div><p className="link-word-line"><TimedWords text={line} words={segments[cue]?.words} time={time} selected={word} onWord={value => void selectWord(value)} /></p>{showTranslation && segments[cue]?.translation && <p className="link-translation">{segments[cue].translation}</p>}{word && <div className="link-word-meaning"><strong>{word}</strong><span>{meaning}</span></div>}</> : <button className="link-add-transcript" onClick={() => { setText(item.transcript || ''); setEditor(true) }}><NavIcon name="dictionary" /><span>添加字幕 / 原文</span></button>}
      <div className="link-learning-actions"><button className="icon-action" aria-label="上一句" title="上一句" disabled={cue === 0} onClick={() => jump(cue - 1)}><NavIcon name="previous" /></button><button className="icon-action" aria-label="下一句" title="下一句" disabled={cue >= count - 1} onClick={() => jump(cue + 1)}><NavIcon name="next" /></button><button className="icon-action" aria-label="记录选中表达" title="记录表达" disabled={!line} onClick={capture}><NavIcon name="bookmark" /></button><button className="icon-action" aria-label="用这句开口练" title="开口练" disabled={!line} onClick={() => onPractice(line, item.title)}><NavIcon name="mic" /></button><button className={`icon-action${notes ? ' selected' : ''}`} aria-label="笔记与重点" title="笔记与重点" onClick={() => setNotes(value => !value)}><NavIcon name="note" /></button><button className="icon-action" aria-label="编辑字幕" title="编辑字幕" onClick={() => { setText(item.transcript || ''); setEditor(value => !value) }}><NavIcon name="dictionary" /></button></div>
    </section>}
    {learning && editor && <div className="link-transcript-input"><label className="redesign-secondary">导入字幕<input type="file" accept=".srt,.vtt,.txt,.json" aria-label="导入链接字幕" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) { setMessage('字幕请控制在 1 MB 内'); return } void file.text().then(value => saveTranscript(value)).catch((error: Error) => setMessage(error.message)) }} /></label><textarea aria-label="链接原文" rows={4} maxLength={200000} value={text} onChange={event => setText(event.target.value)} placeholder="粘贴原文或时间字幕" /><button className="redesign-primary" disabled={saving || !text.trim()} onClick={() => void saveTranscript(text)}>保存</button><button className="icon-action" aria-label="关闭字幕编辑" onClick={() => setEditor(false)}><NavIcon name="close" /></button></div>}
    {learning && segments.length > 0 && <details className="link-cue-list"><summary>句子 · {segments.length}</summary><div>{segments.map((part, index) => <button key={index} aria-current={cue === index ? 'true' : undefined} onClick={() => jump(index)}><span>{Math.floor(part.start / 60)}:{String(Math.floor(part.start % 60)).padStart(2, '0')}</span>{part.text}</button>)}</div></details>}
    {learning && notes && <MaterialStudy key={item.id} item={item} quote={line} time={time} onChange={changed} onSeek={position => setSeek({ time: position, key: Date.now() })} onPractice={onPractice} />}
    {learning && item.lessonPage && <p className="curated-credit"><a href={item.lessonPage} target="_blank" rel="noreferrer">VOA Learning English</a><span>中文学习对照 · English Clip</span></p>}
    {message && <p className="redesign-message" role="status">{message}</p>}
  </div>
}
