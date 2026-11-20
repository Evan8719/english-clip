import { useState } from 'react'
import { coverImageUrl } from '../lib/coverImages'

export function MaterialImage({ images, children }: { images: string[]; children?: React.ReactNode }) {
  const [failed, setFailed] = useState<string[]>([])
  const image = images.find(path => !failed.includes(path))
  return image
    ? <img src={coverImageUrl(image)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(paths => [...paths, image])} />
    : children
}
