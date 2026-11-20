import { useEffect, useState } from 'react'
import type { Entry } from '../types'
import type { MediaItem } from '../lib/media'
import { readCachedMaterial } from '../lib/books'
import { NavIcon } from './NavIcon'

export function SourceVisual({ source, category, materialId, coverUrl }: { source?: string; category?: string; materialId?: string; coverUrl?: string }) {
  const [failedImage, setFailedImage] = useState('')
  const [item, setItem] = useState<MediaItem | null>(null)
  useEffect(() => { let live = true; setItem(null); if (materialId) void readCachedMaterial<MediaItem>(materialId).then(value => { if (live) setItem(value) }); return () => { live = false } }, [materialId])
  const isAliceBook = (item?.kind === 'book' || category === '阅读') && /alice.*wonderland/i.test(item?.title || source || '')
  const image = coverUrl || item?.coverUrl || (isAliceBook ? `${import.meta.env.BASE_URL}covers/alice.webp` : '')
  const title = item?.organization?.collectionTitle || item?.source || source || item?.title || category || '记录'
  const typographic = Boolean((item || category === '播客' || category === '阅读') && title.length < 30 && title !== category)
  return <span className={`source-visual${image ? ' has-image' : ''}`} aria-hidden="true">{image && image !== failedImage ? <img src={image} alt="" onError={() => setFailedImage(image)} /> : typographic ? <span>{title.split(/\s+/).slice(0, 2).join(' ')}</span> : <NavIcon name={category === '阅读' ? 'book' : category === '播客' ? 'audio' : 'note'} />}</span>
}

export function EntrySource({ entry, onOpen }: { entry: Entry; onOpen?: () => void }) {
  const label = entry.source || entry.category || '其他'
  return <div className="entry-source-row"><button className="entry-source-link" disabled={!onOpen} onClick={event => { event.stopPropagation(); onOpen?.() }} aria-label={`来源：${label}${onOpen ? '，回到原文' : ''}`}><SourceVisual source={entry.source} category={entry.category} materialId={entry.enrichment?.origin?.materialId} /><span>{label}</span></button>{entry.tags?.slice(0, 2).map(tag => <span className="entry-source-tag" key={tag}>{tag}</span>)}</div>
}
