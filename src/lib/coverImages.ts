import { describeLink } from './links'
import type { MediaItem } from './media'

export function coverImageUrl(path: string) { return path.startsWith('/') && !path.startsWith(import.meta.env.BASE_URL + 'covers/') ? `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}${path}` : path }

const lifeKit = 'https://media.npr.org/assets/img/2022/09/23/life-kit_tile_npr-network-01_sq-57e850131de55d68e20bbd9dff2408721d7518e2.jpg?s=400&c=66&f=jpg'
const ellloImages = {
  'elllo-starter-camera': 'P0101/144-Trevor-Camera.jpg',
  'elllo-starter-favorite-place': 'P0151/158-Thailand.jpg',
  'elllo-starter-weekend-getaway': 'P0001/041-adrianna-weekend.jpg',
  'elllo-starter-reading': 'P0151/167-Reading.jpg',
  'elllo-starter-music': 'P0201/231-Kate-Music.jpg',
  'elllo-starter-driving': 'P0051/072-Kerri-Driving.jpg',
  'elllo-starter-weather': 'P0051/062-James-Weather.jpg',
  'elllo-starter-recipe': 'P0151/161-CubanFood.jpg',
} as Record<string, string>
const ellloUrl = (image: string) => 'https://elllo.org/Assets/images/' + image

export function programmeArtwork(title?: string) {
  const name = title || ''
  if (/\blife kit\b/i.test(name)) return lifeKit
  if (/\bthe indicator\b/i.test(name)) return 'https://media.npr.org/assets/img/2024/03/25/the-indicator_2024_sq-121249a297878ab2327b321c997ab870300ec659.jpg?s=400&c=66&f=jpg'
  if (/\bplanet money\b/i.test(name)) return 'https://media.npr.org/assets/img/2022/10/24/pm_new_tile_2022_sq-e543deddd0a46a98be481b46e6a72efa6b52236f.jpg?s=400&c=66&f=jpg'
  if (/\bhow i built this\b/i.test(name)) return 'https://megaphone.imgix.net/podcasts/0c36921a-c8b9-11f1-9bb5-c3ba2f4daa29/image/208e047865f4a69316c33e1fc4b6fd1b.png?w=400&h=400&fit=crop&auto=format,compress'
  if (/\bthe daily\b/i.test(name)) return 'https://image.simplecastcdn.com/images/7f2f4c05-9c2f-4deb-82b7-b538062bc22d/73549bf1-94b3-40ff-8aeb-b4054848ec1b/400x400/the-daily-album-art-original.jpg?aid=rss_feed'
  if (/\belllo\b/i.test(name)) return ellloUrl(ellloImages['elllo-starter-camera'])
}

export function materialImages(item: Pick<MediaItem, 'kind' | 'title'> & Partial<Pick<MediaItem, 'id' | 'source' | 'sourceUrl' | 'thumbnailUrl' | 'coverUrl' | 'organization'>>) {
  const videoId = describeLink(item.sourceUrl || '')?.videoId
  const lesson = item.id && ellloImages[item.id]
  return [item.coverUrl,
    item.kind === 'book' && /alice.*wonderland/i.test(item.title) ? `${import.meta.env.BASE_URL}covers/alice.webp` : undefined,
    item.thumbnailUrl,
    videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : undefined,
    item.kind === 'audio' ? lesson ? ellloUrl(lesson) : programmeArtwork(item.organization?.collectionTitle || item.source) : undefined,
  ].filter((path): path is string => Boolean(path))
}

export function materialPoster(item: MediaItem) {
  const image = materialImages(item)[0]
  return image && coverImageUrl(image)
}
