import { NavIcon } from './NavIcon'

/** Local, deterministic covers; story artwork is only used for its matching title. */
export function StoryCover({ title, author = '' }: { title: string; author?: string }) {
  const alice = /alice.*wonderland/i.test(title)
  const palette = [...title].reduce((value, letter) => value + letter.charCodeAt(0), 0) % 4
  return <div className={`story-cover cover-tone-${palette}${alice ? ' illustrated' : ''}`} aria-hidden="true">
    {alice && <img src={`${import.meta.env.BASE_URL}covers/alice.webp`} alt="" loading="lazy" />}
    <span className="cover-bookmark"><NavIcon name="book" /></span>
    <div className="cover-type"><strong>{title.split(/\s*[/;]\s*/)[0]}</strong>{author && <small>{author}</small>}</div>
  </div>
}
