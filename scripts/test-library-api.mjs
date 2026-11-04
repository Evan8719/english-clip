import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { streamConversation } from '../nas/deepseek.mjs'

const data = resolve(`work/library-api-test-${process.pid}`), port = 44000 + process.pid % 9000
mkdirSync(data, { recursive: true })
const child = spawn(process.execPath, ['nas/server.mjs'], { env: { ...process.env, EC_DATA_DIR: data, EC_WEB_DIR: resolve('dist'), EC_HOST: '127.0.0.1', EC_PORT: String(port) }, windowsHide: true, stdio: 'ignore' })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(path, token = '', method = 'GET', body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, data: await res.json() }
}
try {
  for (let i = 0; i < 50; i++) { try { await api('/health'); break } catch { await pause(100) } }
  const owner = await api('/api/auth/register', '', 'POST', { email: 'owner@example.test', password: 'test-only-password' })
  const token = owner.data.token
  assert.ok(token)
  const bookmark = { title: 'Collected English video', kind: 'link', sourceUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', source: 'YouTube' }
  const link = await api('/api/media', token, 'POST', bookmark)
  assert.equal(link.status, 201); assert.equal(link.data.item.status, 'ready'); assert.equal(link.data.item.streamUrl, null)
  assert.equal((await api('/api/media', token, 'POST', bookmark)).data.item.id, link.data.item.id)
  for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,test', 'https://name:password@example.test']) assert.equal((await api('/api/media', token, 'POST', { ...bookmark, sourceUrl })).status, 400)
  const linkSegments = [{ start: 0, end: 3, text: 'Enjoy this book.', words: [{ start: 0, end: 1, text: 'Enjoy' }, { start: 1, end: 2, text: 'this' }, { start: 2, end: 3, text: 'book.' }] }]
  const lesson = await api('/api/media', token, 'POST', { ...bookmark, kind: 'lesson', transcript: 'Enjoy this book.', segments: linkSegments })
  assert.equal(lesson.status, 201); assert.notEqual(lesson.data.item.id, link.data.item.id); assert.deepEqual(lesson.data.item.segments, linkSegments)
  assert.equal((await api(`/api/media/${lesson.data.item.id}/local`, token, 'POST', {})).status, 400)
  const patchedLink = await api(`/api/media/${link.data.item.id}`, token, 'PATCH', { transcript: 'Enjoy this book.', segments: linkSegments, notes: [{ text: 'Saved link note', at: 1 }] })
  assert.deepEqual(patchedLink.data.item.segments, linkSegments); assert.equal(patchedLink.data.item.notes[0].at, 1)
  assert.equal((await api(`/api/media/${link.data.item.id}/local`, token, 'POST', {})).status, 400)
  const book = { title: 'Test book', kind: 'book', contentHash: 'a'.repeat(64), level: 'B1', chapters: [{ title: 'Chapter one', paragraphs: ['Take your time. Enjoy this book. '.repeat(500)] }] }
  const created = await api('/api/media', token, 'POST', book)
  assert.equal(created.status, 201)
  const id = created.data.item.id
  assert.equal((await api('/api/media', token, 'POST', book)).data.duplicate, true)
  const listing = await api('/api/media', token)
  assert.equal(listing.data.items.find(item => item.id === id).chapters, undefined)
  assert.equal((await api(`/api/media/${id}`, token)).data.item.chapters.length, 1)
  const zipped = await fetch(`http://127.0.0.1:${port}/api/media/${id}`, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } })
  assert.equal(zipped.headers.get('content-encoding'), 'gzip')
  assert.equal((await zipped.json()).item.chapters.length, 1)
  assert.equal((await api(`/api/media/${id}`, token, 'PATCH', { readingPosition: { chapter: 0, paragraph: 1 }, level: 'B2' })).data.item.readingPosition.paragraph, 1)
  assert.equal((await api(`/api/media/${id}/process`, token, 'POST', {})).status, 400)
  await api('/api/ai/key', token, 'POST', { apiKey: 'sk-test-deepseek-not-real', provider: 'deepseek' })
  const status = (await api('/api/ai/status', token)).data
  assert.equal(status.deepseekConfigured, true); assert.equal(status.configured, false)
  assert.ok(!readFileSync(join(data, 'media', 'ai-keys.json'), 'utf8').includes('sk-test-deepseek-not-real'))
  await api('/api/ai/key?provider=deepseek', token, 'DELETE')
  const audio = (await api('/api/media', token, 'POST', { title: 'Test audio', kind: 'audio' })).data.item
  const upload = await fetch(`http://127.0.0.1:${port}/api/media/${audio.id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'X-File-Extension': 'mp3' }, body: 'ID3test' })
  assert.equal(upload.status, 200)
  assert.equal((await api(`/api/media/${audio.id}/local`, token, 'POST', {})).data.item.status, 'queued-local')
  assert.equal((await api('/api/local/jobs', token)).data.items.length, 1)
  assert.equal((await api(`/api/media/${audio.id}/local`, token, 'POST', { claim: true })).data.item.status, 'transcribing-local')
  assert.equal((await api(`/api/media/${audio.id}/local`, token, 'POST', { claim: true })).status, 409)
  const complete = await api(`/api/media/${audio.id}/local`, token, 'POST', { transcript: 'I look forward to reading the book. It is an interesting story.', segments: [{ start: 0, end: 3, text: 'I look forward to reading the book.' }] })
  assert.equal(complete.data.item.status, 'ready'); assert.equal(complete.data.item.segments.length, 1)
  assert.ok(complete.data.item.exercises.length > 1)
  const note = { id: 'test-note', at: 1.5, text: 'Remember this expression.', quote: 'I look forward to reading the book.' }
  assert.equal((await api(`/api/media/${audio.id}`, token, 'PATCH', { notes: [note] })).data.item.notes[0].at, 1.5)
  assert.equal((await api(`/api/media/${audio.id}`, token)).data.item.notes[0].text, note.text)
  const summaries = (await api('/api/media', token)).data.items
  assert.ok(summaries.every((item) => !item.segments && !item.notes && !item.transcript))
  const inviteCode = readFileSync(join(data, 'invite-code.txt'), 'utf8').trim()
  const other = await api('/api/auth/register', '', 'POST', { email: 'other@example.test', password: 'test-only-password', inviteCode })
  assert.equal((await api(`/api/media/${id}`, other.data.token)).status, 404)
  assert.equal((await api(`/api/media/${audio.id}`, other.data.token, 'PATCH', { notes: [] })).status, 404)
  assert.equal((await api('/api/local/jobs', other.data.token)).data.items.length, 0)
  assert.equal((await api('/api/local/jobs')).status, 401)
  const res = new EventEmitter(); const chunks = []
  Object.assign(res, { destroyed: false, writableEnded: false, writeHead() {}, flushHeaders() {}, write(s) { chunks.push(s) }, end() { this.writableEnded = true } })
  let beforeEnd = false, requestBody
  const fetcher = async (_url, init) => {
    requestBody = JSON.parse(init.body)
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
      setTimeout(() => { beforeEnd = chunks.some((c) => c.includes('Hello')); controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close() }, 40)
    } }))
  }
  await streamConversation(null, res, { apiKey: 'test', body: { message: 'Hello' }, fetcher })
  assert.equal(beforeEnd, true); assert.equal(requestBody.model, 'deepseek-flash'); assert.equal(requestBody.thinking.type, 'disabled')
  assert.ok(chunks.at(-1).includes('"done":true'))
  console.log(JSON.stringify({ ok: true, checks: ['collected links and prepared lessons separated', 'URL validation and deduplication', 'word timestamps survive roundtrip', 'book chapters and progress', 'content deduplication', 'private account isolation', 'encrypted separate DeepSeek key', 'local queue claim and completion', 'timestamp segments', 'incremental AI stream before completion'] }))
} finally { child.kill(); await pause(100) }
