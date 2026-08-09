import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function createPng(size, rgb = [15, 106, 86]) {
  const [r, g, b] = rgb
  const rows = []
  for (let y = 0; y < size; y++) {
    const line = Buffer.alloc(1 + size * 3)
    line[0] = 0
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5 - size / 2
      const cy = y + 0.5 - size / 2
      const dist = Math.sqrt(cx * cx + cy * cy)
      const inCircle = dist < size * 0.42
      const inBar =
        Math.abs(cy) < size * 0.08 && Math.abs(cx) < size * 0.22
      const inStem =
        Math.abs(cx + size * 0.08) < size * 0.07 &&
        cy > -size * 0.18 &&
        cy < size * 0.22
      const mark = inBar || inStem
      const idx = 1 + x * 3
      if (inCircle) {
        if (mark) {
          line[idx] = 244
          line[idx + 1] = 255
          line[idx + 2] = 249
        } else {
          line[idx] = r
          line[idx + 1] = g
          line[idx + 2] = b
        }
      } else {
        line[idx] = 243
        line[idx + 1] = 239
        line[idx + 2] = 230
      }
    }
    rows.push(line)
  }
  const raw = Buffer.concat(rows)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png
}

writeFileSync(join(publicDir, 'pwa-192.png'), createPng(192))
writeFileSync(join(publicDir, 'pwa-512.png'), createPng(512))
console.log('Generated PWA icons')
