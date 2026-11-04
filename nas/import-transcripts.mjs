// Apply a completed, private offline ASR batch with the backend writer stopped.
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { makeExercises } from './media.mjs'
const [folder, flag, count = '28'] = process.argv.slice(2)
if (!folder || flag !== '--offline' || !process.env.EC_DATA_DIR) throw Error('Usage: EC_DATA_DIR=<data> EC_PID_FILE=<pid> node import-transcripts.mjs <folder> --offline')
if (process.env.EC_PID_FILE && existsSync(process.env.EC_PID_FILE)) {
  let running = false
  try { process.kill(Number(readFileSync(process.env.EC_PID_FILE, 'utf8')), 0); running = true } catch {}
  if (running) throw Error('Stop backend writer before import')
}
const indexFile = join(resolve(process.env.EC_DATA_DIR), 'media', 'index.json')
const index = JSON.parse(readFileSync(indexFile, 'utf8'))
const items = Object.values(index).flatMap(Object.values)
const files = readdirSync(folder).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
if (!Number.isInteger(Number(count)) || Number(count) < 1 || files.length !== Number(count)) throw Error(`Expected all ${count} completed audio items, found ${files.length}`)
const changes = []
for (const name of files) {
  const result = JSON.parse(readFileSync(join(folder, name), 'utf8'))
  if (result.contentHash !== name.slice(0, -5)) throw Error('Transcript hash filename mismatch')
  const matches = items.filter((item) => item.contentHash === result.contentHash)
  if (matches.length !== 1 || !['audio', 'video'].includes(matches[0].kind)) throw Error('Transcript did not match exactly one private original')
  if (typeof result.transcript !== 'string' || result.transcript.trim().length < 100 || !Array.isArray(result.segments) || !result.segments.length) throw Error('Incomplete transcript')
  let previous = -1
  for (const segment of result.segments) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.start < previous || typeof segment.text !== 'string' || !segment.text.trim() || (Number.isFinite(result.duration) && segment.end > result.duration + 0.01)) throw Error('Invalid time axis')
    if (segment.words?.some(word => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < segment.start - 0.01 || word.end > segment.end + 0.01 || word.end <= word.start || typeof word.text !== 'string' || !word.text.trim())) throw Error('Invalid word time axis')
    previous = segment.start
  }
  changes.push({ item: matches[0], result })
}
copyFileSync(indexFile, `${indexFile}.before-podcast-transcripts`)
for (const { item, result } of changes) {
  if (item.transcript?.trim() && !item.transcriptOriginal) item.transcriptOriginal = item.transcript
  item.transcript = result.transcript.trim()
  item.segments = result.segments
  item.status = 'ready'; item.error = ''; item.updatedAt = new Date().toISOString()
  item.exercises = makeExercises(item.transcript)
  item.transcription = { engine: 'local-whisper', model: 'large-v3-turbo', completedAt: item.updatedAt }
}
writeFileSync(`${indexFile}.tmp`, JSON.stringify(index), { mode: 0o600 }); renameSync(`${indexFile}.tmp`, indexFile)
console.log(JSON.stringify({ completedPodcasts: changes.length, segments: changes.reduce((sum, c) => sum + c.result.segments.length, 0), exercises: changes.reduce((sum, c) => sum + c.item.exercises.length, 0) }))
