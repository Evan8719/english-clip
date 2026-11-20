import { usePageNavigation } from '../lib/pageNavigation'
import { NavIcon } from './NavIcon'
import { SourceVisual } from './SourceVisual'
import { MaterialSheet } from './MaterialSheet'
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
  const [historyOpen, setHistoryOpen] = useState(false), [keyboardOpen, setKeyboardOpen] = useState(false), [voiceOptions, setVoiceOptions] = useState(false)
  const [history, setHistory] = useState<SavedPractice[]>([])
  const historyRef = useRef(history); historyRef.current = history
  const activeRef = useRef(active); activeRef.current = active
  const [historyReady, setHistoryReady] = useState(false)
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const [audioBlob, setAudioBlob] = useState<Blob>()
  const [restoredTarget, setRestoredTarget] = useState('')
  const [providerName, setProviderName] = useState('AI')
  useEffect(() => { if (active) void getAiStatus().then(status => setProviderName(status.chatProvider)).catch(() => setProviderName('AI')) }, [active])
  const [voiceReply, setVoiceReply] = useState(() => localStorage.getItem('ec.voice-reply') !== 'off')
  const [voiceSend, setVoiceSend] = useState(() => localStorage.getItem('ec.voice-send') !== 'off')
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

  usePageNavigation({ title: historyOpen ? '练习记录' : '开口练', path: historyOpen ? ['开口练', '练习记录'] : onReturn ? ['素材', seed?.title || '原文', '开口复述'] : ['开口练'], backLabel: dailyReturn && !historyOpen ? '每日练习' : undefined, onBack: historyOpen ? () => setHistoryOpen(false) : dailyReturn ? () => { setMode('daily'); setDailyReturn(false) } : onReturn }, 'practice', historyOpen || Boolean(onReturn) || dailyReturn, 20)
  const sourceEntry = chosenEntry || latest[0]
  return <div className="redesign-page practice-page fidelity-practice"><header className="practice-page-heading"><h1>{historyOpen ? '练习记录' : '开口练'}</h1>{!historyOpen && <button className="fidelity-icon" aria-label="查看练习记录" onClick={() => setHistoryOpen(true)}><NavIcon name="note" /></button>}</header>
    {!historyOpen && <><nav className="practice-mode-tabs" aria-label="练习方式"><button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>每日练习</button><button className={mode === 'shadow' ? 'active' : ''} onClick={() => setMode('shadow')}>跟读</button><button className={mode === 'speak' ? 'active' : ''} onClick={() => setMode('speak')}>对话</button></nav>
    <div hidden={mode !== 'daily'}><DailyPractice active={active && mode === 'daily'} entries={entries} onCapture={onCapture} onOrigin={onOrigin} onShadow={text => { setRestoredTarget(text); setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setAudioBlob(undefined); setRecordedUrl(''); setMode('shadow'); setDailyReturn(true) }} /></div>
    <div hidden={mode === 'daily'}>
      <button className="practice-origin-card" disabled={!onReturn && !sourceEntry?.enrichment?.origin} onClick={() => { if (onReturn) onReturn(); else if (sourceEntry?.enrichment?.origin) onOrigin?.(sourceEntry.enrichment.origin) }}><SourceVisual source={seed?.title || sourceEntry?.source} category={sourceEntry?.category} materialId={sourceEntry?.enrichment?.origin?.materialId} /><span><strong>{seed?.title || sourceEntry?.source || '本子里的表达'}</strong><small>{sourceEntry?.enrichment?.cefrBand || sourceEntry?.category || '自由练习'}</small></span><NavIcon name="next" /></button>
      <div className="practice-focus"><span>这次试着用上</span><strong>{focusWord}</strong><button className="fidelity-icon" aria-label="选择练习表达" onClick={() => setVoiceOptions(true)}><NavIcon name="more" /></button></div>
      {mode === 'shadow' ? <section className="shadow-session"><p className="practice-prompt">{target}</p><div className="practice-orb-row"><button className="fidelity-icon" aria-label="听示范" onClick={() => void speakEnglish(target)}><NavIcon name="volume" /></button><button className={`recording-orb${recording ? ' recording' : ''}`} aria-label={recording ? '结束录音' : '开始跟读录音'} onClick={() => void toggleRecording()}><NavIcon name="mic" /></button></div><p className="muted tiny">{recording ? '正在录音，点按结束' : '点按录音，听听自己的声音'}</p>{recordedUrl && <audio controls src={recordedUrl} />}</section> : <>
      <div className="practice-chat" role="log" aria-label="练习对话" aria-live="polite">{chat.length === 0 && <div className="chat-turn assistant"><span className="chat-avatar"><NavIcon name="audio" /></span><div className="chat-bubble"><small className="chat-prompt-label">练习提示</small><p>What would you like to talk about today? Try using “{focusWord}”.</p></div></div>}
      {chat.map((turn, index) => <div key={index} className={`chat-turn ${turn.role}`}>{turn.role === 'assistant' && <span className="chat-avatar"><NavIcon name="audio" /></span>}<div className="chat-bubble"><p>{turn.content ? turn.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part) : '正在接话…'}</p>{turn.content && <div className="chat-bubble-actions"><button className="fidelity-icon" aria-label={turn.role === 'assistant' ? '朗读 AI 回复' : '朗读我的话'} onClick={() => void speakEnglish(turn.content.replace(/\*\*/g, ''))}><NavIcon name="volume" /></button><button className="fidelity-icon" aria-label="收藏这段表达" onClick={() => onCapture({ text: turn.content, context: target })}><NavIcon name="bookmark" /></button></div>}</div></div>)}<div ref={chatEnd} /></div>
      <div className="practice-composer"><p className="practice-voice-caption">{sending ? `${providerName} 正在接话…` : '点按说话'}</p><div className="practice-orb-row"><button className="fidelity-icon" aria-label="切换文字输入" aria-expanded={keyboardOpen} onClick={() => setKeyboardOpen(value => !value)}><NavIcon name="keyboard" /></button><VoiceInput variant="orb" label="开始语音对话" active={active && mode === 'speak'} disabled={sending} onText={text => { setAnswer(text); if (voiceSend) void sendChat(text); else setKeyboardOpen(true) }} /><button className="fidelity-icon" aria-label="语音与练习选项" onClick={() => setVoiceOptions(true)}><NavIcon name="more" /></button></div>
      {(keyboardOpen || answer) && <div className="practice-text-composer"><textarea aria-label="对话输入" rows={2} value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void sendChat() } }} placeholder="说说你的想法…" /><button className="fidelity-icon" aria-label="发送对话" disabled={!answer.trim() || sending} onClick={() => void sendChat()}><NavIcon name="send" /></button></div>}
      {sending && <button className="redesign-text-button" onClick={() => chatAbort.current?.abort()}>停止生成</button>}
      </div></>}
      {recordedUrl && mode === 'speak' && <audio controls src={recordedUrl} />}
      {message && <p className="practice-feedback" role="status">{message}</p>}
    </div></>}
    {historyOpen && <section className="practice-history"><h2>当前设备</h2><button className="redesign-secondary" onClick={() => { setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setAudioBlob(undefined); setRecordedUrl(''); setHistoryOpen(false) }}>开始新练习</button>{history.length ? history.map(item => <button key={item.id} onClick={() => { setRestoredTarget(item.target); setSessionId(item.id); setChat(item.chat); setAnswer(item.answer); setAudioBlob(item.audio); setRecordedUrl(item.audio ? URL.createObjectURL(item.audio) : ''); setMode('speak'); setHistoryOpen(false); setKeyboardOpen(Boolean(item.answer)) }}>{new Date(item.date).toLocaleString()} · {item.title || item.target.slice(0, 35)} · {item.chat.length} 条</button>) : <p>开始练习后会自动保存。</p>}<p className="muted tiny">录音与对话保存在当前设备，尚不跨设备同步。</p></section>}
    {voiceOptions && <MaterialSheet title="语音与练习" onClose={() => setVoiceOptions(false)}><label className="voice-option"><input type="checkbox" checked={voiceReply} onChange={event => { setVoiceReply(event.target.checked); localStorage.setItem('ec.voice-reply', event.target.checked ? 'on' : 'off') }} />自动朗读 AI 回复</label><label className="voice-option"><input type="checkbox" checked={voiceSend} onChange={event => { setVoiceSend(event.target.checked); localStorage.setItem('ec.voice-send', event.target.checked ? 'on' : 'off') }} />说完自动发送</label><button className="redesign-secondary" onClick={() => void toggleRecording()}>{recording ? '结束录音' : '录音回听'}</button><div className="practice-choices"><h2>换一句练习</h2>{latest.map(entry => <button key={entry.id} className="chip" onClick={() => { setRestoredTarget(''); setChosen(entry.id); setSessionId(crypto.randomUUID()); setChat([]); setAnswer(''); setVoiceOptions(false) }}>{entry.text}</button>)}</div><p className="muted tiny">语音识别由浏览器提供，可能需要联网；说出的文字会发送至所选 AI 服务。</p></MaterialSheet>}
  </div>
}
