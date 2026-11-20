import { materialImages, programmeArtwork } from '../lib/coverImages'
import { NavIcon } from './NavIcon'
import type { MaterialCollection, MediaItem } from '../lib/media'
import { MaterialImage } from './MaterialImage'

/** Original typographic cover treatment, not an official publisher logo. */
export function ProgramCover({ collection, members = [] }: { collection: MaterialCollection; members?: MediaItem[] }) {
  const name = `${collection.title} ${(collection.aliases || []).join(' ')}`
  const theme = /life kit/i.test(name) ? 'sage' : /planet money/i.test(name) ? 'ochre' : /indicator/i.test(name) ? 'clay' : /daily/i.test(name) ? 'ink' : /built this/i.test(name) ? 'slate' : /eslpod/i.test(name) ? 'cream' : collection.library === 'course' ? 'slate' : 'sage'
  const artwork = programmeArtwork(collection.title) || collection.aliases?.map(programmeArtwork).find(Boolean)
  const firstWithCover = [...members].sort((a, b) => (a.organization?.sequence || 0) - (b.organization?.sequence || 0)).find(item => materialImages(item).length)
  const images = [...new Set([collection.coverUrl, artwork, ...(firstWithCover ? materialImages(firstWithCover) : [])].filter((path): path is string => Boolean(path)))]
  return <span className={`program-cover program-cover-${theme}${collection.library === 'course' ? ' program-cover-course' : ''}`} aria-hidden="true"><MaterialImage images={images}>
    <strong>{collection.title}</strong><span className="program-cover-footer"><NavIcon name={collection.library === 'course' ? 'play' : collection.library === 'book' ? 'book' : 'audio'} /></span>
  </MaterialImage></span>
}
