import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMediaApi } from '../nas/media.mjs'

const dataDir = mkdtempSync(join(tmpdir(), 'ec-progress-')), root = join(dataDir, 'media')
mkdirSync(root)
const id = '11111111-1111-1111-1111-111111111111'
const item = { id, ownerId: 'owner', title: 'Test book', kind: 'book', extension: '', createdAt: '2026-11-08', transcript: 'x'.repeat(1000000), chapters: [{ title: 'One', paragraphs: ['First', 'Second'] }], exercises: [], readingPosition: { chapter: 0, paragraph: 0 } }
const indexFile = join(root, 'index.json')
writeFileSync(indexFile, JSON.stringify({ owner: { [id]: item } }))
const baseline = readFileSync(indexFile, 'utf8')
let status, payload
const start = () => createMediaApi({ dataDir, secret: 'test', sendJson: (_res, code, body) => { status = code; payload = body } })
let api = start()
async function call(path, method = 'GET', body = {}, user = 'owner') { await api.handle({ method }, {}, new URL('http://test' + path), { id: user }, async () => body); return { status, payload } }
assert.equal((await call(`/api/media/${id}`)).payload.item.readingPosition.paragraph, 0)
await call(`/api/media/${id}/progress`, 'PATCH', { revision: 0, mutationId: 'one', readingPosition: { chapter: 0, paragraph: 1 } })
assert.equal(status, 200); assert.equal(payload.progress.revision, 1)
assert.ok(JSON.stringify(payload).length < 400)
assert.equal(readFileSync(indexFile, 'utf8'), baseline)
assert.ok(readFileSync(join(root, 'progress.json')).length < 500)
await call(`/api/media/${id}/progress`, 'PATCH', { revision: 0, mutationId: 'one', readingPosition: { chapter: 0, paragraph: 1 } })
assert.equal(status, 200); assert.equal(payload.progress.revision, 1)
await call(`/api/media/${id}/progress`, 'PATCH', { revision: 0, mutationId: 'two', readingPosition: { chapter: 0, paragraph: 0 } })
assert.equal(status, 409); assert.equal(payload.progress.readingPosition.paragraph, 1)
await call(`/api/media/${id}/progress`, 'PATCH', { revision: 1, readingPosition: { chapter: 0, paragraph: 0 } }, 'other')
assert.equal(status, 404)
api = start()
await call(`/api/media/${id}`); assert.equal(payload.item.readingPosition.paragraph, 1)
await call('/api/media'); assert.equal(payload.items[0].revision, 1)
await assert.rejects(() => call(`/api/media/${id}/progress`, 'PATCH', { revision: 1, readingPosition: { chapter: 99, paragraph: 0 } }), /无效/)
await call(`/api/media/${id}`, 'PATCH', { readingPosition: { chapter: 0, paragraph: 0 } })
assert.equal(payload.item.readingPosition.paragraph, 0)
assert.equal(readFileSync(indexFile, 'utf8'), baseline)
console.log(JSON.stringify({ compactWrites: true, compactResponse: true, legacyRead: true, legacyWrite: true, restart: true, compareAndSwap: true, retryIdempotent: true, accountIsolation: true }))
