import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const data = resolve(`work/cover-api-${process.pid}`), port = 45000 + process.pid % 9000, base = `http://127.0.0.1:${port}`
mkdirSync(data, { recursive: true })
const start = () => spawn(process.execPath, ['nas/server.mjs'], { env: { ...process.env, EC_DATA_DIR: data, EC_WEB_DIR: resolve('dist'), EC_PORT: String(port), EC_HOST: '127.0.0.1' }, windowsHide: true, stdio: 'ignore' })
let child = start()
const pause = ms => new Promise(done => setTimeout(done, ms))
async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); return } catch { await pause(100) } } throw Error('Test server unavailable') }
async function api(path, token = '', method = 'GET', body) { const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, data: await response.json() } }
try {
  await ready()
  const owner = (await api('/api/auth/register', '', 'POST', { email: 'cover@example.test', password: 'test-only-password' })).data
  const other = (await api('/api/auth/register', '', 'POST', { email: 'other@example.test', password: 'test-only-password', inviteCode: readFileSync(join(data, 'invite-code.txt'), 'utf8').trim() })).data
  const item = (await api('/api/media', owner.token, 'POST', { kind: 'book', title: 'Cover test', chapters: [{ title: 'One', paragraphs: ['Keep this content.'] }] })).data.item
  const path = `/api/media-covers/${owner.user.id}/item/${item.id}`
  const before = readFileSync(join(data, 'media/index.json'), 'utf8')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'), pair = Buffer.concat([png, png])
  const upload = (token, body = pair, split = png.length) => fetch(base + path, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream', 'X-Cover-Thumb-Length': String(split) }, body })
  assert.equal((await upload(other.token)).status, 401)
  assert.equal((await upload(owner.token, Buffer.from('not an image'), 3)).status, 400)
  assert.equal((await upload(owner.token, Buffer.alloc(2500001), png.length)).status, 413)
  const huge = Buffer.from(png); huge.writeUInt32BE(10000, 16)
  assert.equal((await upload(owner.token, Buffer.concat([huge, png]))).status, 400)
  const uploaded = await upload(owner.token); assert.equal(uploaded.status, 200); const cover = await uploaded.json()
  assert.ok(cover.coverUrl); assert.ok(cover.coverFullUrl)
  const image = await fetch(base + cover.coverUrl); assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png'); assert.ok(Buffer.from(await image.arrayBuffer()).equals(png))
  const tampered = new URL(base + cover.coverUrl); tampered.searchParams.set('sig', '0'.repeat(64)); assert.equal((await fetch(tampered)).status, 403)
  assert.equal((await fetch(base + path)).status, 403)
  assert.equal((await api(`/api/media/${item.id}`, owner.token)).data.item.coverUrl, cover.coverUrl)
  assert.equal(readFileSync(join(data, 'media/index.json'), 'utf8'), before)
  const collection = (await api('/api/media-taxonomy', owner.token)).data.collections[0]
  const collectionPath = `/api/media-covers/${owner.user.id}/collection/${collection.id}`
  const collectionResponse = await fetch(base + collectionPath, { method: 'PUT', headers: { Authorization: 'Bearer '+owner.token, 'X-Cover-Thumb-Length': String(png.length) }, body: pair })
  assert.equal(collectionResponse.status, 200)
  assert.ok((await api('/api/media-taxonomy', owner.token)).data.collections[0].coverUrl)
  assert.equal((await api(collectionPath, owner.token, 'DELETE')).status, 200)
  const options = await fetch(base + path, { method: 'OPTIONS' }); assert.ok(options.headers.get('access-control-allow-headers').includes('X-Cover-Thumb-Length'))
  child.kill(); await new Promise(done => child.once('exit', done)); child = start(); await ready()
  assert.ok((await api(`/api/media/${item.id}`, owner.token)).data.item.coverUrl)
  assert.equal((await api(path, other.token, 'DELETE')).status, 401)
  assert.equal((await api(path, owner.token, 'DELETE')).status, 200)
  assert.equal((await api(`/api/media/${item.id}`, owner.token)).data.item.coverUrl, undefined)
  assert.equal((await fetch(base + cover.coverUrl)).status, 404)
  assert.equal(readFileSync(join(data, 'media/index.json'), 'utf8'), before)
  console.log(JSON.stringify({ accountIsolation: true, formatAndDimensionLimits: true, signedImageUrls: true, separateThumbnailAndDetail: true, contentIndexUnchanged: true, corsHeader: true, restart: true, restoreDefault: true }))
} finally { child.kill() }
