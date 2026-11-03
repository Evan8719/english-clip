import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)
const MAX_UPLOAD = 1024 * 1024 * 1024
const EXTENSIONS = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', mp4: 'video/mp4', mov: 'video/quicktime', ogg: 'audio/ogg' }

function atomicJson(file, value) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  if (existsSync(file)) writeFileSync(`${file}.bak`, readFileSync(file), { mode: 0o600 })
  renameSync(tmp, file)
}

function makeExercises(transcript) {
  const lines = transcript.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter((line) => line.length > 14)
  const sampled = lines.slice(0, 30).filter((_, index) => index % Math.max(1, Math.ceil(lines.length / 8)) === 0).slice(0, 8)
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
  }
  const reject = (res, status, message) => sendJson(res, status, { ok: false, message })

  function readKey(uid) {
    const encrypted = keys[uid]
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
      item.status = item.transcript?.trim() ? 'ready' : 'uploaded'
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
    if (path === '/api/ai/status' && req.method === 'GET') {
      if (!user) return reject(res, 401, '未登录')
      return sendJson(res, 200, { ok: true, configured: Boolean(readKey(user.id)) })
    }
    if (path === '/api/ai/key' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const body = await readBody(req)
      const key = String(body.apiKey || '').trim()
      if (!key.startsWith('sk-') || key.length > 300) return reject(res, 400, 'API 密钥格式不正确')
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
      const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
      keys[user.id] = `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('hex')}`
      saveKeys()
      return sendJson(res, 200, { ok: true, configured: true })
    }
    if (path === '/api/ai/key' && req.method === 'DELETE') {
      if (!user) return reject(res, 401, '未登录')
      delete keys[user.id]
      saveKeys()
      return sendJson(res, 200, { ok: true, configured: false })
    }
    if (path === '/api/ai/chat' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const apiKey = readKey(user.id)
      if (!apiKey) return reject(res, 409, '先在设置中配置 OpenAI API 密钥')
      if (Date.now() - (recentChat.get(user.id) || 0) < 3000) return reject(res, 429, '请稍候再发送')
      const body = await readBody(req)
      const message = String(body.message || '').trim().slice(0, 800)
      const focus = String(body.focus || '').trim().slice(0, 300)
      const history = Array.isArray(body.history) ? body.history.slice(-8).filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string').map((turn) => ({ role: turn.role, content: turn.content.slice(0, 800) })) : []
      if (!message) return reject(res, 400, '请输入练习内容')
      recentChat.set(user.id, Date.now())
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.4-mini', store: false, max_output_tokens: 300, instructions: `You are a warm, concise English conversation partner for a Chinese learner. The focus expression is: ${focus || 'the learner’s own words'}. Reply mainly in natural English, ask one short follow-up question, and offer one gentle correction only when useful. No grades, streaks, or pressure.`, input: [...history, { role: 'user', content: message }] }), signal: AbortSignal.timeout(60000) })
      if (!response.ok) return reject(res, 502, `对话服务返回 ${response.status}；请检查 API 密钥与余额`)
      const payload = await response.json()
      const reply = payload.output?.flatMap((part) => part.content || []).filter((part) => part.type === 'output_text').map((part) => part.text).join('\n').trim()
      if (!reply) return reject(res, 502, '对话服务没有返回内容')
      return sendJson(res, 200, { ok: true, reply })
    }
    if (path === '/api/media' && req.method === 'GET') {
      if (!user) return reject(res, 401, '未登录')
      return sendJson(res, 200, { ok: true, items: Object.values(bucket(user.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicItem) })
    }
    if (path === '/api/media' && req.method === 'POST') {
      if (!user) return reject(res, 401, '未登录')
      const body = await readBody(req)
      const kind = String(body.kind || '')
      const title = String(body.title || '').trim().slice(0, 160)
      const transcript = String(body.transcript || '').trim().slice(0, 200000)
      if (!title || !['audio', 'video', 'text'].includes(kind)) return reject(res, 400, '标题或素材类型无效')
      const now = new Date().toISOString()
      const item = { id: randomUUID(), ownerId: user.id, title, kind, source: String(body.source || '').trim().slice(0, 160), transcript, exercises: transcript ? makeExercises(transcript) : [], status: kind === 'text' ? 'ready' : 'awaiting-file', bytes: 0, extension: '', createdAt: now, updatedAt: now, error: '' }
      bucket(user.id)[item.id] = item
      save()
      return sendJson(res, 201, { ok: true, item: publicItem(item) })
    }
    const match = /^\/api\/media\/([0-9a-f-]{36})(?:\/(file|process))?$/.exec(path)
    if (!match) return false
    const [, id, action] = match
    const item = user ? get(user.id, id) : Object.values(index).map((items) => items[id]).find(Boolean)
    if (!item) return reject(res, 404, '素材不存在')
    if (action === 'file' && (req.method === 'GET' || req.method === 'HEAD')) return serveFile(req, res, item, url)
    if (!user) return reject(res, 401, '未登录')
    if (action === 'file' && req.method === 'PUT') {
      if (item.extension) return reject(res, 409, '文件已经上传')
      await receiveFile(req, item)
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    if (action === 'process' && req.method === 'POST') {
      if (item.status === 'processing') return reject(res, 409, '正在处理')
      if (item.kind !== 'text' && !item.extension) return reject(res, 400, '请先上传文件')
      const key = readKey(user.id)
      if (!item.transcript.trim() && !key) return reject(res, 409, '请先在设置中填写转写 API 密钥，或手动添加原文')
      item.status = 'processing'; item.error = ''; save()
      void process(item, key)
      return sendJson(res, 202, { ok: true, item: publicItem(item) })
    }
    if (!action && req.method === 'GET') return sendJson(res, 200, { ok: true, item: publicItem(item) })
    if (!action && req.method === 'PATCH') {
      const body = await readBody(req)
      if (typeof body.transcript === 'string') item.transcript = body.transcript.trim().slice(0, 200000)
      if (typeof body.title === 'string') item.title = body.title.trim().slice(0, 160) || item.title
      item.exercises = item.transcript ? makeExercises(item.transcript) : []
      item.status = item.transcript ? 'ready' : (item.extension ? 'uploaded' : 'awaiting-file')
      item.updatedAt = new Date().toISOString(); save()
      return sendJson(res, 200, { ok: true, item: publicItem(item) })
    }
    return reject(res, 405, '方法不允许')
  }

  return { handle }
}
