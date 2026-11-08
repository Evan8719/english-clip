import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMediaApi } from '../nas/media.mjs'

const dataDir = mkdtempSync(join(tmpdir(), 'ec-summary-'))
mkdirSync(join(dataDir, 'media'))
const item = { id: 'sample', ownerId: 'owner', title: 'Sample', kind: 'audio', extension: '', createdAt: '2026-11-08', transcript: 'Readable transcript', transcriptOriginal: 'x'.repeat(1000000), transcription: { internal: true }, chapters: [], segments: [{ start: 0, end: 1, text: 'Hello' }], exercises: [], notes: [], libraryPath: '/private/path' }
writeFileSync(join(dataDir, 'media/index.json'), JSON.stringify({ owner: { sample: item } }))
let payload
const api = createMediaApi({ dataDir, secret: 'isolated-test', sendJson: (_res, status, body) => { assert.equal(status, 200); payload = body } })
await api.handle({ method: 'GET' }, {}, new URL('http://test/api/media'), { id: 'owner' })
assert.equal(payload.items[0].title, 'Sample')
assert.equal(payload.items[0].segmentCount, 1)
assert.equal(payload.items[0].transcriptOriginal, undefined)
assert.equal(payload.items[0].libraryPath, undefined)
assert.ok(JSON.stringify(payload).length < 1000)
console.log('Material list excludes original transcript and private catalog fields')

