import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const idPattern = /^[0-9a-f-]{36}$/
const formats = {
  mp3: 'mp3', m4a: 'mov', m4b: 'mov', mp4: 'mov', mov: 'mov',
  wav: 'wav', ogg: 'ogg', webm: 'matroska,webm',
}
const helper = fileURLToPath(new URL('./epub-cover.py', import.meta.url))

export function thumbnailFile(root, item) {
  if (idPattern.test(item.ownerId) && idPattern.test(item.id)) {
    return join(root, 'thumbnails', item.ownerId, `${item.id}.webp`)
  }
}

async function encode(input, options, output, size, bytes) {
  const args = [
    '-nostdin', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-threads', '1',
    ...options, '-i', input, '-map', '0:v:0', '-frames:v', '1', '-an',
    '-vf', `scale=${size}:force_original_aspect_ratio=decrease`,
    '-threads', '1', '-c:v', 'libwebp', '-quality', '78', '-y', output,
  ]
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.EC_THUMBNAIL_FFMPEG || 'ffmpeg', args, {
      timeout: 16000, killSignal: 'SIGKILL', stdio: [bytes ? 'pipe' : 'ignore', 'ignore', 'ignore'],
    })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(Error('No thumbnail could be extracted')))
    if (bytes) {
      child.stdin.on('error', () => {})
      child.stdin.end(bytes)
    }
  })
  if (!(await stat(output)).size) throw Error('Empty thumbnail')
}

export async function buildMaterialThumbnail(root, item, outputRoot = root) {
  const target = thumbnailFile(outputRoot, item)
  const format = formats[item.extension]
  const book = item.kind === 'book' && item.extension === 'epub'
  if (!target || !Object.hasOwn(formats, item.extension) && !book) return false
  if (existsSync(target)) return true

  const original = join(root, 'files', item.ownerId, `${item.id}.${item.extension}`)
  const temp = target.replace(/\.webp$/, `.${randomUUID()}.webp`)
  try {
    if (!existsSync(original)) return false
    await mkdir(join(target, '..'), { recursive: true, mode: 0o700 })
    if (book) {
      const { stdout } = await exec(process.env.EC_THUMBNAIL_PYTHON || 'python3', [helper, original], {
        encoding: 'buffer', timeout: 12000, maxBuffer: 8 * 1024 * 1024,
      })
      if (!stdout.length) return false
      await encode('pipe:0', ['-f', 'image2pipe'], temp, '420:630', stdout)
    } else {
      const options = ['-format_whitelist', format]
      const video = item.kind === 'video' || item.kind === 'lesson'
      await encode(original, video ? [...options, '-ss', '8'] : options, temp, '512:384').catch(error => {
        if (!video) throw error
        return encode(original, options, temp, '512:384')
      })
    }
    await chmod(temp, 0o600)
    await rename(temp, target)
    return true
  } catch {
    return false
  } finally {
    await rm(temp, { force: true }).catch(() => {})
  }
}

// Only the explicit maintenance command walks old materials. Requests read existing images.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [sourcePath, outputPath] = process.argv.slice(2)
  if (!sourcePath || !outputPath) throw Error('Usage: node material-thumbnails.mjs <media root> <output root>')
  const root = resolve(sourcePath)
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'))
  const counts = {}
  for (const entries of Object.values(index)) {
    for (const item of Object.values(entries)) {
      if (await buildMaterialThumbnail(root, item, resolve(outputPath))) {
        counts[item.kind] = (counts[item.kind] || 0) + 1
      }
    }
  }
  console.log(JSON.stringify(counts))
}
