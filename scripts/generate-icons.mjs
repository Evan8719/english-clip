import { readFileSync } from 'node:fs'

const directory = new URL('../public/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', directory), 'utf8'))
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

// The reviewed brand icons are source assets. Preserve them on every build.
for (const icon of manifest.icons) {
  const png = readFileSync(new URL(icon.src, directory))
  const declared = icon.sizes.match(/^(\d+)x(\d+)$/)
  if (!declared || png.length < 24 || !png.subarray(0, 8).equals(pngSignature)
      || png.readUInt32BE(16) !== Number(declared[1]) || png.readUInt32BE(20) !== Number(declared[2])) {
    throw Error(`Invalid PWA icon: ${icon.src}`)
  }
}

console.log('Verified PWA icons')
