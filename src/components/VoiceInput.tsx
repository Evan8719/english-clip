import { NavIcon } from './NavIcon'
import { useEffect, useRef, useState } from 'react'
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
export function VoiceInput({ onText, active = true, disabled = false, label = '点这里，开口说' }: { onText: (text: string) => void; active?: boolean; disabled?: boolean; label?: string }) {
  const [listening, setListening] = useState(false), [message, setMessage] = useState('')
  const recognition = useRef<Recognition | null>(null)
  useEffect(() => () => { if (recognition.current) { recognition.current.onresult = null; recognition.current.onend = null; recognition.current.abort() } }, [])
  useEffect(() => { if (!active) { if (recognition.current) recognition.current.onresult = null; recognition.current?.abort(); setListening(false) } }, [active])
  function start() {
    if (listening) { recognition.current?.stop(); return }
    const host = window as SpeechWindow, Constructor = host.SpeechRecognition || host.webkitSpeechRecognition
    if (!Constructor) { setMessage('当前浏览器不支持语音识别，可使用手机键盘的麦克风输入，或保留录音回听。'); return }
    window.speechSynthesis?.cancel()
    const next = new Constructor(); recognition.current = next
    next.lang = 'en-US'; next.continuous = false; next.interimResults = false
    next.onresult = (event) => { const text = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(' ').trim(); if (text) { onText(text); setMessage('已识别，可编辑或发送') } }
    next.onerror = (event) => { setListening(false); setMessage(event.error === 'not-allowed' ? '麦克风未获允许，请在浏览器中允许麦克风。' : `语音识别未完成（${event.error}），可重试或用键盘麦克风。`) }
    next.onend = () => setListening(false)
    try { next.start(); setListening(true); setMessage('正在听，请说英语…') } catch { setMessage('语音识别无法启动，请重试。') }
  }
  return <div className="voice-input"><button type="button" className="redesign-secondary" disabled={disabled} onClick={start}><NavIcon name="mic" />{listening ? '正在听 · 结束说话' : label}</button><span className="muted tiny" role="status">{message}</span></div>
}
