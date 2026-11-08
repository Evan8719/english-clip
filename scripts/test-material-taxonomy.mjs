import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMediaApi } from '../nas/media.mjs'

const dataDir = mkdtempSync(join(tmpdir(), 'ec-taxonomy-')), root = join(dataDir, 'media')
mkdirSync(root)
const id = '11111111-1111-1111-1111-111111111111', courseId = '22222222-2222-2222-2222-222222222222'
const item = { id, ownerId: 'owner', title: 'Life_Kit - Health', source: 'Life Kit', kind: 'audio', transcript: 'Original content', extension: '', exercises: [], createdAt: '2026-11-08', notes: [{ text: 'Keep me' }], playbackPosition: 12 }
writeFileSync(join(root, 'index.json'), JSON.stringify({ owner: { [id]: item, [courseId]: { ...item, id: courseId, title: 'Episode 2', kind: 'video', courseId: 'family-album', episode: 2 } } }))
const original = readFileSync(join(root, 'index.json'), 'utf8')
let status, payload
const start = () => createMediaApi({ dataDir, secret: 'test', sendJson: (_res, code, body) => { status = code; payload = body } })
let api = start()
const call = async (path, method = 'GET', body, uid = 'owner') => { await api.handle({ method }, {}, new URL('http://test' + path), uid ? { id: uid } : null, async () => body); return payload }
await call('/api/media-taxonomy'); const life = payload.collections.find(c => c.title === 'Life Kit'); assert.ok(life)
assert.equal(payload.collections.find(c => c.title === '走遍美国').library, 'course')
assert.equal(existsSync(join(root, 'taxonomy.json')), false)
await call(`/api/media/${id}`); assert.equal(payload.item.organization.inferred, false)
await call('/api/media-taxonomy', 'POST', { ...life, title: 'Life Kit 改名', purposes: ['生活实用', '短篇观点'] })
await call(`/api/media/${id}`); assert.equal(payload.item.organization.collectionId, life.id); assert.equal(payload.item.organization.collectionTitle, 'Life Kit 改名'); assert.equal(payload.item.organization.purposes.length, 2)
await call(`/api/media/${id}/organization`, 'PATCH', { collectionId: life.id, purposes: [], topics: ['健康', '健康'], sequence: 7 })
assert.equal(payload.item.organization.purposes.length, 0); assert.deepEqual(payload.item.organization.topics, ['健康']); assert.equal(payload.item.organization.sequence, 7)
await call(`/api/media/${id}/organization`, 'PATCH', { collectionId: life.id, purposes: null })
assert.equal(payload.item.organization.purposes.length, 2)
await call('/api/media-taxonomy', 'POST', { library: 'course', category: '课程', title: 'New Course', purposes: [] }); const target = payload.collection
await call(`/api/media/${id}/organization`, 'PATCH', { collectionId: target.id, sequence: 1 })
assert.equal(payload.item.organization.library, 'course')
await call(`/api/media/${id}/organization`, 'PATCH', { collectionId: target.id }, 'another'); assert.equal(status, 404)
await assert.rejects(() => call('/api/media-taxonomy', 'POST', { ...target }, 'another'), /不存在/)
await call('/api/media-taxonomy', 'GET', null, null); assert.equal(status, 401)
await assert.rejects(() => call('/api/media-taxonomy', 'POST', { library: 'course', category: '课程', title: 'New Course' }), /已存在/)
api = start(); await call(`/api/media/${id}`); assert.equal(payload.item.organization.collectionId, target.id); assert.equal(payload.item.notes[0].text, 'Keep me'); assert.equal(payload.item.playbackPosition, 12)
assert.equal(readFileSync(join(root, 'index.json'), 'utf8'), original)
console.log(JSON.stringify({ virtualPreviewNoWrites: true, renameStableId: true, defaultInheritance: true, explicitEmptyOverride: true, moveKeepsContent: true, accountIsolation: true, restart: true, duplicateRejected: true }))
