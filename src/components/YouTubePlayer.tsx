import { useEffect, useRef, useState } from 'react'
import { NavIcon } from './NavIcon'

interface Player { getCurrentTime(): number; getDuration(): number; getPlayerState(): number; playVideo(): void; pauseVideo(): void; seekTo(time: number, ahead: boolean): void; setPlaybackRate(rate: number): void; destroy(): void }
interface PlayerApi { Player: new (element: HTMLElement, options: object) => Player }
type YoutubeWindow = Window & { YT?: PlayerApi; onYouTubeIframeAPIReady?: () => void }
let loading: Promise<PlayerApi> | undefined
function loadApi(): Promise<PlayerApi> {
  const host = window as YoutubeWindow
  if (host.YT?.Player) return Promise.resolve(host.YT)
  if (!loading) loading = new Promise<PlayerApi>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(() => { script.remove(); reject(Error('YouTube 连接超时，可以打开原网页或重试。')) }, 15000)
    host.onYouTubeIframeAPIReady = () => { window.clearTimeout(timer); if (host.YT) resolve(host.YT) }
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(Error('暂时无法连接 YouTube，请检查网络或打开原网页。')) }
    script.src = 'https://www.youtube.com/iframe_api'; document.head.append(script)
  }).catch((error) => { loading = undefined; throw error })
  return loading
}
const stamp = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
export function YouTubePlayer({ videoId, active, start, seek, onProgress }: { videoId: string; active: boolean; start: number; seek?: { time: number; key: number }; onProgress: (time: number, duration: number) => void }) {
  const element = useRef<HTMLDivElement>(null), player = useRef<Player | null>(null)
  const progress = useRef(onProgress); progress.current = onProgress
  const starting = useRef(start); starting.current = start
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState(''), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!active || !enabled) return
    let disposed = false
    setReady(false); setError('')
    void loadApi().then((api) => {
      if (disposed || !element.current) return
      const mount = document.createElement('div'); element.current.replaceChildren(mount)
      player.current = new api.Player(mount, { width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com', videoId, playerVars: { playsinline: 1, origin: window.location.origin, start: Math.floor(starting.current) }, events: {
        onReady: () => { if (!disposed) setReady(true) },
        onStateChange: () => { if (!disposed) setPlaying(player.current?.getPlayerState() === 1) },
        onError: () => { if (!disposed) setError('此视频暂时无法嵌入播放，请打开原网页。') },
      } })
    }).catch((error: Error) => { if (!disposed) setError(error.message) })
    const timer = window.setInterval(() => { const p = player.current; if (!p?.getCurrentTime) return; const time = p.getCurrentTime() || 0, length = p.getDuration() || 0; setPosition(time); setDuration(length); progress.current(time, length) }, 120)
    return () => { disposed = true; window.clearInterval(timer); player.current?.destroy(); player.current = null; setReady(false); setPlaying(false) }
  }, [videoId, active, enabled, retry])
  useEffect(() => { if (seek) setEnabled(true) }, [seek])
  useEffect(() => { if (seek && ready) { player.current?.seekTo(seek.time, true); player.current?.playVideo() } }, [seek, ready])
  return <div className="youtube-player">
    {!enabled ? <button className="link-play-placeholder" onClick={() => setEnabled(true)} aria-label="加载 YouTube 播放器"><NavIcon name="play" /><span>YouTube</span></button> : <div className="youtube-frame" ref={element} />}
    {enabled && !ready && !error && <p className="muted tiny" role="status">连接 YouTube…</p>}
    {error && <div className="link-player-error" role="status">{error}<button className="redesign-text-button" onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    <div className="link-player-controls"><button className="icon-action" aria-label={playing ? '暂停视频' : '播放视频'} disabled={!ready} onClick={() => playing ? player.current?.pauseVideo() : player.current?.playVideo()}><NavIcon name={playing ? 'pause' : 'play'} /></button><input type="range" aria-label="视频播放进度" min="0" max={duration || 1} step="0.1" disabled={!ready || !duration} value={Math.min(position, duration || 1)} onChange={(event) => { const time = Number(event.target.value); setPosition(time); player.current?.seekTo(time, true) }} /><span>{stamp(position)} / {stamp(duration)}</span><select aria-label="视频播放速度" disabled={!ready} defaultValue="1" onChange={(event) => player.current?.setPlaybackRate(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></div>
  </div>
}
