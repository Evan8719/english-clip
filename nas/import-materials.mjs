// Offline import only. Stop the backend writer and back up data/ before running.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { makeExercises } from './media.mjs'

const [manifestPath, flag] = process.argv.slice(2)
if (!manifestPath || flag !== '--offline') throw Error('Usage: EC_DATA_DIR=<data> node import-materials.mjs <manifest.json> --offline (writer must be stopped)')
const data = resolve(process.env.EC_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data'))
if (process.env.EC_PID_FILE && existsSync(process.env.EC_PID_FILE)) {
  const pid = Number(readFileSync(process.env.EC_PID_FILE, 'utf8'))
  let running = false
  try { process.kill(pid, 0); running = true } catch {}
  if (running) throw Error('Backend is still running; stop the writer first')
}
const store = JSON.parse(readFileSync(join(data, 'store.json'), 'utf8'))
const users = Object.keys(store.users || {})
if (users.length !== 1) throw Error('This importer requires exactly one existing account; no account was selected')
const uid = users[0], root = dirname(resolve(manifestPath))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const media = join(data, 'media'), indexPath = join(media, 'index.json')
mkdirSync(join(media, 'files', uid), { recursive: true, mode: 0o700 })
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {}
index[uid] ||= {}
let imported = 0, skipped = 0
// Validate the whole batch before changing the index.
for (const item of manifest.items) {
  const file = resolve(root, item.file)
  if (!file.startsWith(root + sep) || !realpathSync(file).startsWith(realpathSync(root) + sep) || !['audio', 'video', 'book', 'text'].includes(item.kind)) throw Error('Invalid manifest path or kind')
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== item.contentHash) throw Error('File checksum mismatch')
}
for (const item of manifest.items) {
  if (Object.values(index[uid]).some((old) => old.contentHash === item.contentHash)) { skipped++; continue }
  const id = randomUUID(), extension = item.file.split('.').pop()
  if (!['mp3', 'epub', 'mp4', 'wav', 'm4a', 'webm', 'ogg', 'mov'].includes(extension)) throw Error('Unsupported extension')
  const target = join(media, 'files', uid, `${id}.${extension}`)
  copyFileSync(resolve(root, item.file), target)
  chmodSync(target, 0o600)
  const now = new Date().toISOString()
  const transcript = String(item.transcript || '')
  index[uid][id] = { ...item, id, ownerId: uid, extension, createdAt: now, updatedAt: now, exercises: transcript ? makeExercises(transcript) : [], status: item.kind === 'book' || transcript ? 'ready' : 'queued-local', error: '', file: undefined }
  imported++
}
if (existsSync(indexPath)) copyFileSync(indexPath, `${indexPath}.before-import`)
writeFileSync(`${indexPath}.tmp`, JSON.stringify(index), { mode: 0o600 }); renameSync(`${indexPath}.tmp`, indexPath)
console.log(JSON.stringify({ imported, skipped, total: Object.keys(index[uid]).length }))
