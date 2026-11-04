import { useEffect, useRef } from 'react'

export function PreparedVideo({ src, active, start, seek, onProgress }: { src: string; active: boolean; start: number; seek?: { time: number; key: number }; onProgress: (time: number) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const progress = useRef(onProgress); progress.current = onProgress
  useEffect(() => {
    const node = video.current
    if (!active) { node?.pause(); return }
    const timer = window.setInterval(() => { if (node) progress.current(node.currentTime) }, 120)
    return () => { window.clearInterval(timer); node?.pause() }
  }, [active])
  useEffect(() => { if (seek && video.current) { video.current.currentTime = seek.time; void video.current.play().catch(() => undefined) } }, [seek])
  return <video ref={video} className="prepared-video" src={src} controls playsInline preload="metadata" onLoadedMetadata={() => { if (video.current && start > 0 && start < video.current.duration) video.current.currentTime = start }} onTimeUpdate={() => { if (video.current) progress.current(video.current.currentTime) }} />
}
