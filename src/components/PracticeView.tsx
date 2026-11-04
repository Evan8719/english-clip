import { useEffect, useRef, useState } from 'react'
import type { Entry } from '../types'
import { speakEnglish } from '../lib/speech'
import { VoiceInput } from './VoiceInput'
import { DailyPractice } from './DailyPractice'
import { getDb } from '../db/database'
import { getStoredUserId } from '../lib/sync'
import { chatWithAi, getAiStatus } from '../lib/media'

interface SavedPractice { id: string; date: string; target: string; title: string; chat: Array<{ role: 'user' | 'assistant'; content: string }>; answer: string; audio?: Blob }
interface Props { dailyRequest?: number; onOrigin?: (origin: NonNullable<Entry['enrichment']>['origin']) => void; active?: boolean; onReturn?: () => void; entries: Entry[]; seed?: { text: string; title: string } | null; onCapture: (seed: { text: string; context?: string }) => void }

export function PracticeView({ entries, seed, onCapture, onReturn, active = true, dailyRequest = 0, onOrigin }: Props) {
  const [history, setHistory] = useState<SavedPractice[]>([])
  const historyRef = useRef(history); historyRef.current = history
  const activeRef = useRef(active); activeRef.current = active
  const [historyReady, setHistoryReady] = useState(false)
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const [audioBlob, setAudioBlob] = useState<Blob>()
  const [restoredTarget, setRestoredTarget] = useState('')
  const [providerName, setProviderName] = useState('AI')
  useEffect(() => { if (active) void getAiStatus().then(status => setProviderName(status.chatProvider)).catch(() => setProviderName('AI')) }, [active])
  const [voiceReply, setVoiceReply] = useState(false)
  const [voiceSend, setVoiceSend] = useState(false)
  const historyKey = 'practice-history:' + (getStoredUserId() || 'local')
  useEffect(() => { let active = true; void getDb().then(db => db.get('meta', historyKey)).then(row => { if (active) { setHistory((row?.value as SavedPractice[]) || []); setHistoryReady(true) } }); return () => { active = false } }, [historyKey])
  const [mode, setMode] = useState<'daily' | 'shadow' | 'speak'>(seed ? 'speak' : 'daily')
  const [dailyReturn, setDailyReturn] = useState(false)
  useEffect(() => { if (dailyRequest) { setMode('daily'); setDailyReturn(false) } }, [dailyRequest])
  const [chosen, setChosen] = useState('')
  const [answer, setAnswer] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState('')
  const [message, setMessage] = useState('')
  const [chat, setChat] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [sending, setSending] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const sourceStream = useRef<MediaStream | null>(null)
  const chatAbort = useRef<AbortController | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!active || mode === 'daily') { chatAbort.current?.abort(); if (recorder.current?.state === 'recording') recorder.current.stop(); setRecording(false); window.speechSynthesis?.cancel() } }, [active, mode])
  const latest = entries.slice(0, 8)
  const chosenEntry = entries.find((entry) => entry.id === chosen)
  const target = restoredTarget || chosenEntry?.context || chosenEntry?.text || seed?.text || latest[0]?.context || latest[0]?.text || 'I am looking forward to the weekend.'
  const focusWord = restoredTarget || chosenEntry?.text || seed?.text || latest[0]?.text || 'look forward to'
  useEffect(() => { if (seed) { setDailyReturn(false); chatAbort.current?.abort(); setMode('speak'); setChosen(''); setRestoredTarget(''); setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setAudioBlob(undefined); setRecordedUrl('') } }, [seed])
  useEffect(() => {
    if (!historyReady || (!chat.length && !audioBlob && !answer.trim())) return
    const timer = window.setTimeout(() => { const record: SavedPractice = { id: sessionId, date: new Date().toISOString(), target, title: seed?.title || '', chat: chat.filter(turn => turn.content), answer, audio: audioBlob }; { const next = [record, ...historyRef.current.filter(item => item.id !== sessionId)].slice(0, 100); setHistory(next); void getDb().then(db => db.put('meta', { key: historyKey, value: next })).catch(() => setMessage('保存练习失败，请检查设备存储空间')); } }, 250)
    return () => window.clearTimeout(timer)
  }, [chat, audioBlob, answer, historyReady, historyKey, sessionId, target, seed?.title])
  useEffect(() => () => chatAbort.current?.abort(), [])
  useEffect(() => { if (active) chatEnd.current?.scrollIntoView({ block: 'nearest' }) }, [chat, active])

  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); sourceStream.current?.getTracks().forEach((track) => track.stop()); if (recordedUrl) URL.revokeObjectURL(recordedUrl) }, [recordedUrl])

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      sourceStream.current = stream
      const chunks: BlobPart[] = []
      const next = new MediaRecorder(stream)
      recorder.current = next
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' }); setAudioBlob(blob); setRecordedUrl(URL.createObjectURL(blob))
        setMessage('录音已加入本机练习记录，可以回顾。')
      }
      next.start(); setRecording(true); setMessage('正在录音…')
    } catch { setMessage('无法使用麦克风。可以检查浏览器权限，或先用文字练习。') }
  }

  async function sendChat(spoken?: string) {
    const value = (spoken || answer).trim()
    if (!value || sending) return
    const history = chat.filter((turn) => turn.content)
    const next = [...history, { role: 'user' as const, content: value }, { role: 'assistant' as const, content: '' }]
    setChat(next); setSending(true); setMessage(`${providerName} 正在接话…`)
    chatAbort.current = new AbortController()
    let reply = ''
    try {
      await chatWithAi(value, focusWord, history, (delta) => { reply += delta; setChat([...next.slice(0, -1), { role: 'assistant', content: reply }]); setMessage('') }, chatAbort.current.signal)
      setAnswer(''); setMessage(''); if (activeRef.current && voiceReply && reply) void speakEnglish(reply.replace(/\*\*/g, '')).catch(() => setMessage('请点击 AI 回复下的朗读按钮播放声音'))
    } catch (error) { if (!reply) setChat(history); setMessage((error as Error).name === 'AbortError' ? '已停止生成' : (error as Error).message) } finally { setSending(false) }
  }

  return <div className="redesign-page practice-page">{dailyReturn && <button className="redesign-text-button practice-return" onClick={() => { setMode('daily'); setDailyReturn(false) }}>← 返回每日练习</button>}{onReturn && <button className="redesign-text-button practice-return" onClick={onReturn}>← 返回刚才的素材 / 阅读位置</button>}<header className="redesign-heading"><div><h1>{mode === 'daily' ? '每日练习' : '开口练'}</h1><p>从本子里的表达和素材原句出发，听、跟读，再说自己的话。</p></div></header>
    <div className="practice-mode-tabs"><button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>每日练习</button><button className={mode === 'shadow' ? 'active' : ''} onClick={() => setMode('shadow')}>跟读一句</button><button className={mode === 'speak' ? 'active' : ''} onClick={() => setMode('speak')}>带词对话</button></div>
    <div hidden={mode !== 'daily'}><DailyPractice active={active && mode === 'daily'} entries={entries} onCapture={onCapture} onOrigin={onOrigin} onShadow={text => { setRestoredTarget(text); setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setAudioBlob(undefined); setRecordedUrl(''); setMode('shadow'); setDailyReturn(true) }} /></div>
    <div hidden={mode === 'daily'}>
    {seed?.title && <p className="practice-source">来自素材 · {seed.title}</p>}
    <div className="practice-content">{mode === 'shadow' ? <><p className="redesign-eyebrow">先听一遍，再按自己的节奏说</p><div className="practice-prompt">{target}</div><div className="practice-actions"><button className="redesign-secondary" onClick={() => void speakEnglish(target)}>▶ 听示范</button><button className={recording ? 'redesign-primary recording' : 'redesign-primary'} onClick={() => void toggleRecording()}>{recording ? '■ 结束录音' : '● 开始跟读'}</button></div>{recordedUrl && <div className="practice-playback"><p>听听自己的声音</p><audio controls src={recordedUrl} /><button className="redesign-text-button" onClick={() => void toggleRecording()}>再说一次</button></div>}</> : <><p className="redesign-eyebrow">这次试着用上</p><div className="practice-prompt">{focusWord.length > 80 ? focusWord.slice(0,80) + '…' : focusWord}</div>{focusWord.length > 80 && <details><summary>展开完整练习原文</summary><p>{focusWord}</p></details>}<p>用语音或文字说一句，{providerName} 会回应、纠正，再接着问一句。</p><label><input type="checkbox" checked={voiceReply} onChange={(e) => { setVoiceReply(e.target.checked); if (e.target.checked) void speakEnglish('Ready.') }} /> 自动朗读 AI 回复</label><label><input type="checkbox" checked={voiceSend} onChange={(e) => setVoiceSend(e.target.checked)} /> 说完自动发送</label><VoiceInput active={active} disabled={sending} onText={(text) => { setAnswer(text); if (voiceSend) void sendChat(text) }} /><div className="practice-chat">{chat.length === 0 && <div className="assistant">What would you like to talk about today? Try using “{focusWord}”.</div>}{chat.map((turn, index) => <div key={index} className={turn.role}>{turn.content ? turn.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part) : '正在接话…'}{turn.content && <div><button className="redesign-text-button" onClick={() => void speakEnglish(turn.content.replace(/\*\*/g, ''))}>{turn.role === 'assistant' ? '听 AI 回复' : '听我的这句'}</button><button className="redesign-text-button" onClick={() => onCapture({ text: turn.content, context: target })}>{turn.role === 'assistant' ? '收藏这段表达' : '收藏我的这句'}</button></div>}</div>)}<div ref={chatEnd} /></div><textarea aria-label="对话输入" rows={3} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void sendChat() } }} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={`试着用 “${focusWord}” 回答`} /><div className="practice-actions"><button className="redesign-primary" disabled={!answer.trim() || sending} onClick={() => void sendChat()}>{sending ? '正在回答…' : '发送 · 即时反馈'}</button>{sending && <button className="redesign-secondary" onClick={() => chatAbort.current?.abort()}>停止</button>}<button className="redesign-secondary" disabled={!answer.trim()} onClick={() => void speakEnglish(answer)}>▶ 朗读我的输入</button><button className={recording ? 'redesign-primary recording' : 'redesign-secondary'} onClick={() => void toggleRecording()}>{recording ? '■ 结束录音' : '● 录音回听'}</button><button className="redesign-text-button" disabled={!answer.trim()} onClick={() => onCapture({ text: answer.trim(), context: `练习表达：${focusWord}` })}>收藏我的输入</button></div>{recordedUrl && <audio controls src={recordedUrl} />}<p className="muted tiny">语音识别由浏览器提供，可能需要联网；识别文字发送给所选 AI 服务。录音和对话自动保存在当前设备，可在下方回顾。</p></>}
      {message && <p className="redesign-message" role="status">{message}</p>}
    </div>
    <section className="practice-history"><h2>练习记录 · 当前设备</h2><button className="redesign-secondary" onClick={() => { setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setAudioBlob(undefined); setRecordedUrl('') }}>开始新练习</button>{history.length ? history.map(item => <button key={item.id} onClick={() => { setRestoredTarget(item.target); setSessionId(item.id); setChat(item.chat); setAnswer(item.answer); setAudioBlob(item.audio); setRecordedUrl(item.audio ? URL.createObjectURL(item.audio) : ''); setMode('speak') }}>{new Date(item.date).toLocaleString()} · {item.title || item.target.slice(0, 35)} · {item.chat.length} 条</button>) : <p>开始说话或对话后会自动保存。</p>}</section>
    {latest.length > 0 && <div className="practice-choices"><h2>从最近记录里选一句</h2><div>{latest.map((entry) => <button key={entry.id} className={chosen === entry.id ? 'active' : ''} onClick={() => { setRestoredTarget(''); setChosen(entry.id) }}>{entry.text}</button>)}</div></div>}
    <p className="muted tiny">练习对话及录音保存在当前设备，按 NAS 账号隔离；尚不跨设备同步。</p>
    </div>
  </div>
}
