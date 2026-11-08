import { useState } from 'react'
import { coverImageUrl } from '../lib/coverImages'
import { NavIcon } from './NavIcon'
import type { MaterialCollection } from '../lib/media'

/** Original typographic cover treatment, not an official publisher logo. */
export function ProgramCover({ collection }: { collection: MaterialCollection }) {
  const [failed, setFailed] = useState('')
  if (collection.coverUrl && failed !== collection.coverUrl) return <span className="program-cover program-cover-image"><img src={coverImageUrl(collection.coverUrl)} alt="" loading="lazy" onError={() => setFailed(collection.coverUrl!)} /></span>
  const name = `${collection.title} ${(collection.aliases || []).join(' ')}`
  const theme = /life kit/i.test(name) ? 'sage' : /planet money/i.test(name) ? 'ochre' : /indicator/i.test(name) ? 'clay' : /daily/i.test(name) ? 'ink' : /built this/i.test(name) ? 'slate' : /eslpod/i.test(name) ? 'cream' : collection.library === 'course' ? 'slate' : 'sage'
  return <span className={`program-cover program-cover-${theme}`} aria-hidden="true"><strong>{collection.title}</strong><span className="program-cover-footer"><span>{collection.library === 'course' ? 'COURSE' : collection.library === 'book' ? 'READING' : 'LISTEN & LEARN'}</span><NavIcon name={collection.library === 'course' ? 'play' : collection.library === 'book' ? 'book' : 'audio'} /></span></span>
}
