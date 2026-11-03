import { streamConversation } from './deepseek.mjs'
import { generateStudyGuide } from './study-guide.mjs'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)
const MAX_UPLOAD = 1024 * 1024 * 1024
const EXTENSIONS = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', mp4: 'video/mp4', mov: 'video/quicktime', ogg: 'audio/ogg', epub: 'application/epub+zip' }

function atomicJson(file, value) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  if (existsSync(file)) writeFileSync(`${file}.bak`, readFileSync(file), { mode: 0o600 })
  renameSync(tmp, file)
}

export function makeExercises(transcript) {
  const lines = transcript.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter((line) => line.length > 14)
  const sampled = lines.filter((_, index) => index % Math.max(1, Math.ceil(lines.length / 8)) === 0).slice(0, 8)
  const exercises = sampled.map((line, index) => {
    const words = line.match(/[A-Za-z][A-Za-z'-]{3,}/g) || []
    const word = words.find((value) => !/^(this|that|with|from|have|your|they|were|about)$/i.test(value)) || words[0]
    const blank = word ? line.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '_____') : line
    return { id: `line-${index + 1}`, kind: 'listen', prompt: blank, answer: word || line, reference: line }
  })
  if (sampled[0]) exercises.unshift({ id: 'shadow-1', kind: 'shadow', prompt: '听一遍，再跟读这句', answer: sampled[0], reference: sampled[0] })
  if (transcript.trim()) exercises.push({ id: 'retell-1', kind: 'retell', prompt: '用自己的话复述这段素材', answer: '', reference: transcript.slice(0, 1200) })
  return exercises
}

export function createMediaApi({ dataDir, secret, sendJson }) {
  const root = join(dataDir, 'media')
  const filesDir = join(root, 'files')
  const jobsDir = join(root, 'jobs')
  const indexFile = join(root, 'index.json')
  const keysFile = join(root, 'ai-keys.json')
  mkdirSync(filesDir, { recursive: true })
  mkdirSync(jobsDir, { recursive: true })
  let index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {}
  let keys = existsSync(keysFile) ? JSON.parse(readFileSync(keysFile, 'utf8')) : {}
  const recentChat = new Map()
  const guideJobs = new Set()
  const encryptionKey = createHash('sha256').update(secret).digest()
  const save = () => atomicJson(indexFile, index)
  const saveKeys = () => atomicJson(keysFile, keys)
  const bucket = (uid) => (index[uid] ||= {})
  const get = (uid, id) => bucket(uid)[id]
  const fileFor = (item) => join(filesDir, item.ownerId, `${item.id}.${item.extension}`)
  const sign = (item, exp) => createHmac('sha256', secret).update(`${item.ownerId}:${item.id}:${exp}`).digest('hex')
  const publicItem = (item) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    return { ...item, streamUrl: item.extension ? `/api/media/${item.id}/file?exp=${exp}&sig=${sign(item, exp)}` : null }
  }
  for (const items of Object.values(index)) for (const item of Object.values(items)) {
    if (item.status === 'processing') { item.status = 'failed'; item.error = '服务重启中断了处理，请重新生成'; save() }
    if (item.status === 'transcribing-local') { item.status = 'queued-local'; save() }
    if (item.guideStatus === 'processing') { item.guideStatus = 'failed'; item.guideError = '服务重启，请重新整理重点'; save() }
  }
  const reject = (res, status, message) => sendJson(res, status, { ok: false, message })

  async function prepareGuide(item) {
    const key = readKey(item.ownerId, 'deepseek')
    if (!key || !item.transcript || item.kind === 'book' || guideJobs.has(item.id)) return
    const transcript = item.transcript
    guideJobs.add(item.id); item.guideStatus = 'processing'; item.guideError = ''; save()
    try { const guide = await generateStudyGuide({ ...item, transcript }, key); if (item.transcript === transcript) { item.studyGuide = guide; item.guideStatus = 'ready' } }
    catch (error) { item.guideStatus = 'failed'; item.guideError = error.message }
    finally { guideJobs.delete(item.id); save() }
  }

  function readKey(uid, provider = 'openai') {
    const encrypted = keys[provider === 'deepseek' ? `${uid}:deepseek` : uid]
    if (!encrypted) return ''
    try {
      const [iv, tag, data] = encrypted.split('.')
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))
      return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
    } catch { return '' }
  }

  async function transcribe(item, apiKey) {
    const folder = join(jobsDir, item.id)
    mkdirSync(folder, { recursive: true })
    try {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', fileFor(item), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'segment', '-segment_time', '600', join(folder, 'part-%03d.mp3')], { timeout: 600000 })
      const parts = readdirSync(folder).filter((name) => /^part-\d+\.mp3$/.test(name)).sort()
      if (!parts.length || parts.length > 36) throw new Error('无法处理这段音频；请确认文件可播放且不超过 6 小时')
      const texts = []
      for (const part of parts) {
        const bytes = readFileSync(join(folder, part))
        if (bytes.length > 25 * 1024 * 1024) throw new Error('转写分段超过服务限制')
        const form = new FormData()
        form.set('model', 'gpt-transcribe')
        form.set('file', new Blob([bytes], { type: 'audio/mpeg' }), part)
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(180000) })
        if (!response.ok) throw new Error(`转写服务返回 ${response.status}；请检查 API 密钥与余额`)
        const payload = await response.json()
        if (typeof payload.text !== 'string') throw new Error('转写服务没有返回原文')
        texts.push(payload.text.trim())
      }
      return texts.join('\n\n')
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }

  async function process(item, apiKey) {
    try {
      if (!item.transcript?.trim()) item.transcript = await transcribe(item, apiKey)
      item.exercises = makeExercises(item.transcript)
      item.status = 'ready'
      item.error = ''
    } catch (error) {
      item.status = 'failed'
      item.error = error.message || '处理失败'
    }
    item.updatedAt = new Date().toISOString()
    save()
    if (item.status === 'ready') void prepareGuide(item)
  }

  async function receiveFile(req, item) {
    const length = Number(req.headers['content-length'] || 0)
    if (length > MAX_UPLOAD) throw Object.assign(new Error('文件不能超过 1 GB'), { status: 413 })
    const extension = String(req.headers['x-file-extension'] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!EXTENSIONS[extension]) throw Object.assign(new Error('不支持的音视频格式'), { status: 400 })
    const directory = join(filesDir, item.ownerId)
    mkdirSync(directory, { recursive: true })
    const target = join(directory, `${item.id}.${extension}`)
    const tmp = `${target}.part`
    const stream = createWriteStream(tmp, { flags: 'wx', mode: 0o600 })
    let size = 0
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_UPLOAD) throw Object.assign(new Error('文件不能超过 1 GB'), { status: 413 })
        if (!stream.write(chunk)) await once(stream, 'drain')
      }
      stream.end()
      await once(stream, 'finish')
      if (!size) throw Object.assign(new Error('文件为空'), { status: 400 })
      renameSync(tmp, target)
      item.extension = extension
      item.bytes = size
      item.status = item.kind === 'book' || item.transcript?.trim() ? 'ready' : 'uploaded'
      item.exercises = item.transcript?.trim() ? makeExercises(item.transcript) : []
      item.updatedAt = new Date().toISOString()
      save()
    } catch (error) {
      stream.destroy()
      rmSync(tmp, { force: true })
      throw error
    }
  }

  function serveFile(req, res, item, url) {
    const exp = Number(url.searchParams.get('exp'))
    const sig = url.searchParams.get('sig') || ''
    const expected = sign(item, exp)
    if (!Number.isSafeInteger(exp) || exp < Date.now() / 1000 || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return reject(res, 403, '播放链接已过期')
    const file = fileFor(item)
    if (!existsSync(file)) return reject(res, 404, '文件不存在')
    const size = statSync(file).size
    const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''))
    const start = match ? Number(match[1]) : 0
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (start >= size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
    res.writeHead(match ? 206 : 200, { 'Content-Type': EXTENSIONS[item.extension], 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file, { start, end }).pipe(res)
  }

  async function handle(req, res, url, user, readBody) {
    const path = url.pathname
    if (path === '/api/local/jobs' && req.method === 'GET') {
      if (!user) return reject(res, 401, '未登录')
      for (const item of Object.values(bucket(user.id))) if (item.status === 'transcribing-local' && (item.localLeaseUntil || 0) < Date.now()) { item.status = 'queued-local'; save() }
      return sendJson(res, 200, { ok: true, items: Object.values(bucket(user.id)).filter((item) => item.status === 'queued-local').map(publicItem) })
    }
    if (path === '/api/ai/status' && req.method === 'GET') {
      if (!user) return reject(res, 401, '未登录')
      return sendJson(res, 200, { ok: true, configured: Boolean(readKey(user.id)), deepseekConfigured: Boolean(readKey(user.id, 'deepseek')), chatProvider: 'DeepSeek', model: 'deepseek-flash' })
    }
    if (path === '/api/ai/key' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const body = await readBody(req)
      const keyId = body.provider === 'deepseek' ? `${user.id}:deepseek` : user.id
      const key = String(body.apiKey || '').trim()
      if (!key.startsWith('sk-') || key.length > 300) return reject(res, 400, 'API 密钥格式不正确')
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
      const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
      keys[keyId] = `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('hex')}`
      saveKeys()
      return sendJson(res, 200, { ok: true, configured: true })
    }
    if (path === '/api/ai/key' && req.method === 'DELETE') {
      if (!user) return reject(res, 401, '未登录')
      delete keys[url.searchParams.get('provider') === 'deepseek' ? `${user.id}:deepseek` : user.id]
      saveKeys()
      return sendJson(res, 200, { ok: true, configured: false })
    }
    if (path === '/api/ai/chat' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const apiKey = readKey(user.id, 'deepseek')
      if (!apiKey) return reject(res, 409, '先在设置中配置 DeepSeek API 密钥')
      if (recentChat.get(user.id)) return reject(res, 429, '当前回答尚未完成')
      const body = await readBody(req)
      recentChat.set(user.id, true)
      try { await streamConversation(req, res, { apiKey, body }) } finally { recentChat.delete(user.id) }
      return true
    }
    if (path === '/api/media' && req.method === 'GET') {
      if (!user) return reject(res, 401, '未登录')
      return sendJson(res, 200, { ok: true, items: Object.values(bucket(user.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => {
        const result = publicItem(item)
        result.chapterCount = item.chapters?.length || 0
        result.segmentCount = item.segments?.length || 0
        result.exerciseCount = item.exercises?.length || 0
        result.transcript = ''; result.exercises = []
        delete result.chapters; delete result.segments; delete result.studyGuide; delete result.notes
        return result
      }) })
    }
    if (path === '/api/media' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const body = await readBody(req)
      const kind = String(body.kind || '')
      const title = String(body.title || '').trim().slice(0, 160)
      const transcript = String(body.transcript || '').trim().slice(0, 200000)
      if (!title || !['audio', 'video', 'text', 'book'].includes(kind)) return reject(res, 400, '标题或素材类型无效')
      const contentHash = /^[a-f0-9]{64}$/.test(body.contentHash || '') ? body.contentHash : ''
      const duplicate = contentHash && Object.values(bucket(user.id)).find((item) => item.contentHash === contentHash)
      if (duplicate) return sendJson(res, 200, { ok: true, item: publicItem(duplicate), duplicate: true })
      const chapters = Array.isArray(body.chapters) ? body.chapters.slice(0, 1000).map((chapter) => ({ title: String(chapter.title || '').slice(0, 300), paragraphs: Array.isArray(chapter.paragraphs) ? chapter.paragraphs.map((p) => String(p).slice(0, 20000)).slice(0, 10000) : [] })) : []
      const now = new Date().toISOString()
      const item = { id: randomUUID(), ownerId: user.id, title, kind, source: String(body.source || '').trim().slice(0, 160), transcript, exercises: transcript ? makeExercises(transcript) : [], status: kind === 'text' ? 'ready' : 'awaiting-file', bytes: 0, extension: '', createdAt: now, updatedAt: now, error: '' }
      Object.assign(item, { contentHash, level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(body.level) ? body.level : '', levelBasis: String(body.levelBasis || '待评估').slice(0, 50), chapters, author: String(body.author || '').slice(0, 200) })
      item.segments = Array.isArray(body.segments) ? body.segments.slice(0, 10000).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start).map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').slice(0, 2000) })) : []
      if (kind === 'book' && chapters.length) item.status = 'ready'
      bucket(user.id)[item.id] = item
      save()
      if (kind === 'text' && transcript) void prepareGuide(item)
      return sendJson(res, 201, { ok: true, item: publicItem(item) })
    }
    const match = /^\/api\/media\/([0-9a-f-]{36})(?:\/(file|process|local|guide))?$/.exec(path)
    if (!match) return false
    const [, id, action] = match
    const item = user ? get(user.id, id) : Object.values(index).map((items) => items[id]).find(Boolean)
    if (!item) return reject(res, 404, '素材不存在')
    if (action === 'file' && (req.method === 'GET' || req.method === 'HEAD')) return serveFile(req, res, item, url)
    if (!user) return reject(res, 401, '未登录')
    if (action === 'guide' && req.method === 'POST') {
      if (!readKey(user.id, 'deepseek')) return reject(res, 409, '请先在设置中配置 DeepSeek')
      if (!item.transcript || item.kind === 'book') return reject(res, 400, '请先为音视频生成原文')
      await prepareGuide(item)
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    if (action === 'local' && req.method === 'POST') {
      if (!item.extension || item.kind === 'book') return reject(res, 400, '请先上传音视频')
      const body = await readBody(req)
      if (body.claim) {
        if (item.status !== 'queued-local') return reject(res, 409, '任务已被领取或取消')
        item.status = 'transcribing-local'; item.localLeaseUntil = Date.now() + 2 * 60 * 60 * 1000
      } else if (typeof body.transcript === 'string') {
        if (item.status !== 'transcribing-local') return reject(res, 409, '任务状态已变化')
        item.transcript = body.transcript.trim().slice(0, 200000)
        item.segments = Array.isArray(body.segments) ? body.segments.slice(0, 10000).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end >= s.start).map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').slice(0, 2000) })) : []
        item.exercises = makeExercises(item.transcript); item.status = 'ready'; item.error = ''
      } else if (body.error) { item.status = 'failed'; item.error = String(body.error).slice(0, 300) }
      else { if (['processing', 'transcribing-local'].includes(item.status)) return reject(res, 409, '任务正在处理'); item.status = 'queued-local'; item.error = '' }
      item.updatedAt = new Date().toISOString(); save()
      if (typeof body.transcript === 'string') void prepareGuide(item)
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    if (action === 'file' && req.method === 'PUT') {
      if (item.extension) return reject(res, 409, '文件已经上传')
      await receiveFile(req, item)
      if (item.transcript) void prepareGuide(item)
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    if (action === 'process' && req.method === 'POST') {
      if (item.kind === 'book') return reject(res, 400, '电子书请选取段落阅读或练习')
      if (['processing', 'transcribing-local'].includes(item.status)) return reject(res, 409, '正在处理')
      if (item.kind !== 'text' && !item.extension) return reject(res, 400, '请先上传文件')
      const key = readKey(user.id)
      if (!item.transcript.trim() && !key) return reject(res, 409, '请先在设置中填写转写 API 密钥，或手动添加原文')
      item.status = 'processing'; item.error = ''; save()
      void process(item, key)
      return sendJson(res, 202, { ok: true, item: publicItem(item) })
    }
    if (!action && req.method === 'GET') return sendJson(res, 200, { ok: true, item: publicItem(item) })
    if (!action && req.method === 'PATCH') {
      if (['processing', 'transcribing-local'].includes(item.status)) return reject(res, 409, '请等待当前处理完成后编辑')
      const body = await readBody(req)
      if (typeof body.level === 'string') { item.level = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(body.level) ? body.level : ''; item.levelBasis = '手动选择' }
      if (Number.isFinite(body.playbackPosition)) item.playbackPosition = Math.max(0, Math.min(86400, body.playbackPosition))
      if (body.readingPosition && item.kind === 'book') item.readingPosition = { chapter: Math.max(0, Math.min(item.chapters.length - 1, Number(body.readingPosition.chapter) || 0)), paragraph: Math.max(0, Math.floor(Number(body.readingPosition.paragraph) || 0)) }
      if (typeof body.transcript === 'string') item.transcript = body.transcript.trim().slice(0, 200000)
      if (typeof body.title === 'string') item.title = body.title.trim().slice(0, 160) || item.title
      if (Array.isArray(body.notes)) item.notes = body.notes.slice(0, 500).filter((note) => typeof note.text === 'string' && note.text.trim()).map((note) => ({ id: String(note.id || randomUUID()).slice(0, 64), text: note.text.trim().slice(0, 4000), at: Math.max(0, Math.min(86400, Number(note.at) || 0)), quote: String(note.quote || '').slice(0, 2000), createdAt: String(note.createdAt || new Date().toISOString()).slice(0, 40) }))
      if (typeof body.transcript === 'string') {
        item.exercises = item.transcript ? makeExercises(item.transcript) : []
        item.status = item.kind === 'book' || item.transcript ? 'ready' : (item.extension ? 'uploaded' : 'awaiting-file')
        item.segments = []
        delete item.studyGuide; item.guideStatus = ''; item.guideError = ''
      }
      item.updatedAt = new Date().toISOString(); save()
      if (typeof body.transcript === 'string') void prepareGuide(item)
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    return reject(res, 405, '方法不允许')
  }

  return { handle }
}
