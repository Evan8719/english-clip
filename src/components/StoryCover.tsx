import { materialImages } from '../lib/coverImages'
import { NavIcon } from './NavIcon'
import { MaterialImage } from './MaterialImage'

/** Local, deterministic covers; story artwork is only used for its matching title. */
export function StoryCover({ title, author = '', coverUrl, thumbnailUrl }: { title: string; author?: string; coverUrl?: string; thumbnailUrl?: string }) {
  const images = materialImages({ kind: 'book', title, coverUrl, thumbnailUrl })
  const palette = [...title].reduce((value, letter) => value + letter.charCodeAt(0), 0) % 4
  return <div className={`story-cover cover-tone-${palette}`} aria-hidden="true">
    <MaterialImage images={images}>
      <span className="story-cover-glyph"><NavIcon name="book" /></span>
      <div className="cover-type"><strong>{title.split(/\s*[/;]\s*/)[0]}</strong>{author && <small>{author}</small>}</div>
    </MaterialImage>
  </div>
}
