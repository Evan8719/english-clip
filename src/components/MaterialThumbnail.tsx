import type { MediaItem } from '../lib/media'
import { describeLink } from '../lib/links'
import { materialImages } from '../lib/coverImages'
import { NavIcon } from './NavIcon'
import { MaterialImage } from './MaterialImage'

export function MaterialThumbnail({ item }: { item: MediaItem }) {
  const video = item.kind === 'video' || item.kind === 'lesson' || Boolean(describeLink(item.sourceUrl || '')?.videoId)
  const icon = video ? 'play' : item.kind === 'audio' ? 'audio' : item.kind === 'link' ? 'link' : 'book'
  return <span className={`material-thumb material-thumb-${icon}`} aria-hidden="true"><MaterialImage images={materialImages(item)}><NavIcon name={icon} /></MaterialImage></span>
}
