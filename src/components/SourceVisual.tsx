import { useEffect, useState } from 'react'
import type { Entry } from '../types'
import type { MediaItem } from '../lib/media'
import { readCachedMaterial } from '../lib/books'
import { NavIcon } from './NavIcon'
import { MaterialImage } from './MaterialImage'
import { materialImages } from '../lib/coverImages'

export function SourceVisual({ source, category, materialId, coverUrl }: { source?: string; category?: string; materialId?: string; coverUrl?: string }) {
  const [item, setItem] = useState<MediaItem | null>(null)
  useEffect(() => { let live = true; setItem(null); if (materialId) void readCachedMaterial<MediaItem>(materialId).then(value => { if (live) setItem(value) }); return () => { live = false } }, [materialId])
  const images = materialImages(item ?? { kind: category === '阅读' ? 'book' : category === '播客' ? 'audio' : 'text', title: source || '', source })
  if (coverUrl) images.unshift(coverUrl)
  const title = item?.organization?.collectionTitle || item?.source || source || item?.title || category || '记录'
  const typographic = Boolean((item || category === '播客' || category === '阅读') && title.length < 30 && title !== category)
  return <span className="source-visual" aria-hidden="true"><MaterialImage images={images}>{typographic ? <span>{title.split(/\s+/).slice(0, 2).join(' ')}</span> : <NavIcon name={category === '阅读' ? 'book' : category === '播客' ? 'audio' : 'note'} />}</MaterialImage></span>
}

export function EntrySource({ entry, onOpen }: { entry: Entry; onOpen?: () => void }) {
  const label = entry.source || entry.category || '其他'
  return <div className="entry-source-row"><button className="entry-source-link" disabled={!onOpen} onClick={event => { event.stopPropagation(); onOpen?.() }} aria-label={`来源：${label}${onOpen ? '，回到原文' : ''}`}><SourceVisual source={entry.source} category={entry.category} materialId={entry.enrichment?.origin?.materialId} /><span>{label}</span></button>{entry.tags?.slice(0, 2).map(tag => <span className="entry-source-tag" key={tag}>{tag}</span>)}</div>
}
