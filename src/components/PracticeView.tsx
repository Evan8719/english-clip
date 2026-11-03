import { useEffect, useRef, useState } from 'react'
import type { Entry } from '../types'
import { speakEnglish } from '../lib/speech'
import { chatWithAi } from '../lib/media'

interface Props { entries: Entry[]; seed?: { text: string; title: string } | null; onCapture: (seed: { text: string; context?: string }) => void }

export function PracticeView({ entries, seed, onCapture }: Props) {
  const [mode, setMode] = useState<'shadow' | 'speak'>('shadow')
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
  const latest = entries.slice(0, 8)
  const chosenEntry = entries.find((entry) => entry.id === chosen)
  const target = chosenEntry?.context || chosenEntry?.text || seed?.text || latest[0]?.context || latest[0]?.text || 'I am looking forward to the weekend.'
  const focusWord = chosenEntry?.text || seed?.text || latest[0]?.text || 'look forward to'
  useEffect(() => () => chatAbort.current?.abort(), [])
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }) }, [chat])

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
        setRecordedUrl(URL.createObjectURL(new Blob(chunks, { type: next.mimeType || 'audio/webm' })))
        setMessage('录音只留在当前设备，听一听再试一次。')
      }
      next.start(); setRecording(true); setMessage('正在录音…')
    } catch { setMessage('无法使用麦克风。可以检查浏览器权限，或先用文字练习。') }
  }

  async function sendChat() {
    const value = answer.trim()
    if (!value || sending) return
    const history = chat.filter((turn) => turn.content)
    const next = [...history, { role: 'user' as const, content: value }, { role: 'assistant' as const, content: '' }]
    setChat(next); setSending(true); setMessage('DeepSeek 正在接话…')
    chatAbort.current = new AbortController()
    let reply = ''
    try {
      await chatWithAi(value, focusWord, history, (delta) => { reply += delta; setChat([...next.slice(0, -1), { role: 'assistant', content: reply }]); setMessage('') }, chatAbort.current.signal)
      setAnswer(''); setMessage('')
    } catch (error) { if (!reply) setChat(history); setMessage((error as Error).name === 'AbortError' ? '已停止生成' : (error as Error).message) } finally { setSending(false) }
  }

  return <div className="redesign-page practice-page"><header className="redesign-heading"><div><h1>开口练</h1><p>从本子里的表达和素材原句出发，听、跟读，再说自己的话。</p></div></header>
    <div className="practice-mode-tabs"><button className={mode === 'shadow' ? 'active' : ''} onClick={() => setMode('shadow')}>跟读一句</button><button className={mode === 'speak' ? 'active' : ''} onClick={() => setMode('speak')}>带词对话</button></div>
    {seed?.title && <p className="practice-source">来自素材 · {seed.title}</p>}
    <div className="practice-content">{mode === 'shadow' ? <><p className="redesign-eyebrow">先听一遍，再按自己的节奏说</p><div className="practice-prompt">{target}</div><div className="practice-actions"><button className="redesign-secondary" onClick={() => void speakEnglish(target)}>▶ 听示范</button><button className={recording ? 'redesign-primary recording' : 'redesign-primary'} onClick={() => void toggleRecording()}>{recording ? '■ 结束录音' : '● 开始跟读'}</button></div>{recordedUrl && <div className="practice-playback"><p>听听自己的声音</p><audio controls src={recordedUrl} /><button className="redesign-text-button" onClick={() => void toggleRecording()}>再说一次</button></div>}</> : <><p className="redesign-eyebrow">这次试着用上</p><div className="practice-prompt">{focusWord}</div><p>用这个表达聊聊今天的事。可以先打字，DeepSeek 会简短回应、纠正一处表达，再接着问一句。</p><div className="practice-chat">{chat.length === 0 && <div className="assistant">What would you like to talk about today? Try using “{focusWord}”.</div>}{chat.map((turn, index) => <div key={index} className={turn.role}>{turn.content || '正在接话…'}</div>)}<div ref={chatEnd} /></div><textarea aria-label="对话输入" rows={3} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void sendChat() } }} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={`试着用 “${focusWord}” 回答`} /><div className="practice-actions"><button className="redesign-primary" disabled={!answer.trim() || sending} onClick={() => void sendChat()}>{sending ? '正在回答…' : '发送 · 即时反馈'}</button>{sending && <button className="redesign-secondary" onClick={() => chatAbort.current?.abort()}>停止</button>}<button className="redesign-secondary" disabled={!answer.trim()} onClick={() => void speakEnglish(answer)}>▶ 听这句话</button><button className={recording ? 'redesign-primary recording' : 'redesign-secondary'} onClick={() => void toggleRecording()}>{recording ? '■ 结束录音' : '● 练习开口'}</button><button className="redesign-text-button" disabled={!answer.trim()} onClick={() => onCapture({ text: answer.trim(), context: `练习表达：${focusWord}` })}>记下这句</button></div>{recordedUrl && <audio controls src={recordedUrl} />}<p className="muted tiny">发送文字会使用你在设置中配置的 AI 服务；录音仍只在本机回听，不自动发送。</p></>}
      {message && <p className="redesign-message" role="status">{message}</p>}
    </div>
    {latest.length > 0 && <div className="practice-choices"><h2>从最近记录里选一句</h2><div>{latest.map((entry) => <button key={entry.id} className={chosen === entry.id ? 'active' : ''} onClick={() => setChosen(entry.id)}>{entry.text}</button>)}</div></div>}
    <p className="muted tiny">录音由你主动开始，默认只在当前设备临时播放，不上传或评分。</p>
  </div>
}
