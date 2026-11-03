import { useState } from 'react'
import { authorizedApiFetch } from '../lib/sync'
import { patchMedia, type MediaItem } from '../lib/media'

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export function MaterialStudy({ item, quote, time, onChange, onSeek, onPractice }: { item: MediaItem; quote: string; time: number; onChange: (item: MediaItem) => void; onSeek: (time: number) => void; onPractice: (text: string, title: string) => void }) {
  const [tab, setTab] = useState('points'), [draft, setDraft] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function saveNote() {
    if (!draft.trim() || busy) return
    setBusy(true); setMessage('')
    try {
      const note = { id: crypto.randomUUID(), text: draft.trim(), at: time, quote, createdAt: new Date().toISOString() }
      onChange(await patchMedia(item.id, { notes: [...(item.notes || []), note] })); setDraft(''); setMessage('笔记已保存到 NAS')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  async function generate() {
    setBusy(true); setMessage('正在整理本篇的重点表达与理解练习…')
    try {
      const response = await authorizedApiFetch(`/api/media/${item.id}/guide`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw Error(data.message)
      onChange(data.item); setMessage(data.item.guideError || '')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="material-study" aria-label="素材学习笔记与重点">
    <div className="library-type-tabs" role="group" aria-label="学习内容">{[['points', '重点表达'], ['notes', `笔记 ${item.notes?.length || 0}`], ['questions', '理解练习']].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMessage('') }}>{label}</button>)}</div>
    {message && <p className="muted tiny" role="status">{message}</p>}
    {tab === 'notes' ? <div className="material-notes">
      <label htmlFor="material-note">记下理解、疑问或想试着说的话 · {stamp(time)}</label>
      {quote && <blockquote>{quote}</blockquote>}
      <textarea id="material-note" rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="笔记会带上当前选句和时间" />
      <button className="redesign-primary" disabled={busy || !draft.trim() || (item.notes?.length || 0) >= 500} onClick={() => void saveNote()}>{busy ? '正在保存…' : '保存笔记'}</button>
      {(item.notes || []).map((note) => <article className="material-note" key={note.id}><button className="redesign-text-button" onClick={() => onSeek(note.at)}>{stamp(note.at)} · 回到此处</button><p>{note.text}</p>{note.quote && <small>{note.quote}</small>}</article>)}
    </div> : item.studyGuide ? <>
      {tab === 'points' ? <><p className="study-summary">{item.studyGuide.summary}</p><ul>{item.studyGuide.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>{item.studyGuide.points.map((point, index) => <article className="study-point" key={index}><strong>{point.title}</strong><p>{point.explanation}</p><blockquote>{point.example}</blockquote><div>{point.start !== undefined && <button className="redesign-text-button" onClick={() => onSeek(point.start!)}>▶ {stamp(point.start)} 听原句</button>}<button className="redesign-text-button" onClick={() => onPractice(point.example, item.title)}>用这句开口练 →</button></div></article>)}</> : item.studyGuide.questions.map((question, index) => <details className="study-question" key={index}><summary>{index + 1}. {question.question}</summary><p>{question.answer}</p><button className="redesign-text-button" onClick={() => onPractice(question.question, item.title)}>试着口头回答 →</button></details>)}
      <p className="muted tiny">AI 根据本篇原文整理，可结合原句核对。</p>
    </> : <div><p className="muted">{item.guideStatus === 'processing' ? '正在整理本篇的重点表达…' : item.guideError || '根据本篇原文整理常用表达、用法和理解练习。'}</p><button className="redesign-secondary" disabled={busy || !item.transcript || item.guideStatus === 'processing'} onClick={() => void generate()}>用 DeepSeek 整理本篇</button></div>}
  </section>
}
