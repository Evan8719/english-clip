import { useEffect, useState } from 'react'
import type { MaterialCollection, MediaItem } from '../lib/media'
import { readCachedMaterial } from '../lib/books'
import { ProgramCover } from './ProgramCover'
import { NavIcon } from './NavIcon'

const mediaTime = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
export function ProgramDetail({ collection, members, onOpen, onMenu }: { collection: MaterialCollection; members: MediaItem[]; onOpen: (item: MediaItem) => void; onMenu: () => void }) {
  const resume = [...members].filter(item => item.lastStudiedAt || item.playbackPosition).sort((a,b) => (b.lastStudiedAt || '').localeCompare(a.lastStudiedAt || ''))[0] || members[0]
  const duration = useDuration(resume), position = resume?.playbackPosition || 0
  const course = collection.library === 'course'
  const action = course ? '学习' : '收听'
  return <section className={`programme-detail${course ? ' programme-course-detail' : ''}`}><div className="programme-overview"><ProgramCover collection={collection} members={members} /><div><h1>{collection.title}</h1><p>{members.length} {course ? '课' : '集'} · {[...new Set(members.map(item => item.level).filter(Boolean))].join(' / ') || '等级待评估'}</p><div className="app-use-tags">{collection.purposes.map(tag => <span key={tag}>{tag}</span>)}</div>{position > 0 && <p className="programme-position">上次{course ? '看到' : '听到'} {mediaTime(position)}</p>}{duration && position > 0 ? <progress className="learning-progress" value={Math.min(position, duration)} max={duration} aria-label="上次单集播放进度" /> : null}</div><button className="fidelity-icon programme-menu" aria-label={`管理分组 ${collection.title}`} onClick={onMenu}><NavIcon name="more" /></button></div>
    <div className="programme-play-actions"><button className="redesign-primary" disabled={!resume} onClick={() => resume && onOpen(resume)}><NavIcon name="play" />{position > 0 || resume?.lastStudiedAt ? '继续' : '开始'}{action}</button><button className="fidelity-icon programme-shuffle" disabled={!members.length} aria-label={`随机${action}一集`} onClick={() => { if (members.length) onOpen(members[Math.floor(Math.random() * members.length)]) }}><NavIcon name="shuffle" /></button></div>
  </section>
}

export function EpisodeProgress({ item }: { item: MediaItem }) {
  const duration = useDuration(item)
  return <><small>{duration ? mediaTime(duration) : item.playbackPosition ? `已听 ${mediaTime(item.playbackPosition)}` : '时长待载入'}</small>{duration && Boolean(item.playbackPosition) && <progress className="learning-progress episode-progress" value={Math.min(item.playbackPosition!, duration)} max={duration} aria-label={`${item.title}播放进度`} />}</>
}

function useDuration(item?: MediaItem) {
  const [cached, setCached] = useState<{ id: string; duration?: number }>()
  const id = item?.id
  const duration = item?.durationSeconds
  useEffect(() => {
    if (!id || duration) return
    let live = true
    void readCachedMaterial<MediaItem>(id).then(value => {
      if (live) setCached({ id, duration: value?.durationSeconds })
    }).catch(() => undefined)
    return () => { live = false }
  }, [id, duration])
  return duration || (cached && cached.id === id ? cached.duration : undefined)
}
