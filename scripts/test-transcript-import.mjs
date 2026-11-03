import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const root = resolve(`work/transcript-import-test-${process.pid}`), media = join(root, 'media'), results = join(root, 'results')
mkdirSync(media, { recursive: true }); mkdirSync(results)
const items = {}, text = 'This is a complete sample sentence used for listening practice. '.repeat(5)
for (let i = 0; i < 28; i++) {
  const contentHash = i.toString(16).padStart(64, '0')
  items[`audio-${i}`] = { kind: 'audio', contentHash, status: 'queued-local', notes: [{ text: 'keep me' }] }
  writeFileSync(join(results, `${contentHash}.json`), JSON.stringify({ contentHash, transcript: text, duration: 4, segments: [{ start: 0, end: 3, text }] }))
}
items.book = { kind: 'book', readingPosition: { chapter: 3, paragraph: 10 } }
const index = join(media, 'index.json'); writeFileSync(index, JSON.stringify({ owner: items }))
const options = { env: { ...process.env, EC_DATA_DIR: root }, encoding: 'utf8', stdio: 'pipe' }
const badFile = join(results, `${'0'.repeat(64)}.json`), valid = readFileSync(badFile)
writeFileSync(badFile, JSON.stringify({ contentHash: '0'.repeat(64), transcript: text, segments: [{ start: 3, end: 1, text }] }))
const before = readFileSync(index)
assert.throws(() => execFileSync(process.execPath, ['nas/import-transcripts.mjs', results, '--offline'], options))
assert.ok(before.equals(readFileSync(index)), 'invalid batch partially changed the index')
writeFileSync(badFile, valid)
const report = JSON.parse(execFileSync(process.execPath, ['nas/import-transcripts.mjs', results, '--offline'], options))
assert.equal(report.completedPodcasts, 28)
const saved = JSON.parse(readFileSync(index, 'utf8')).owner
assert.ok(Object.values(saved).filter(i => i.kind === 'audio').every(i => i.status === 'ready' && i.notes[0].text === 'keep me' && i.exercises.length > 1))
assert.deepEqual(saved.book, items.book)
assert.ok(before.equals(readFileSync(`${index}.before-podcast-transcripts`)))
console.log(JSON.stringify({ ok: true, checks: ['all 28 required', 'invalid batch leaves index unchanged', 'original notes and book position preserved', 'pre-import index backed up'] }))
