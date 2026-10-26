#!/usr/bin/env node
/**
 * English Clip · 自建后端 + 静态托管（零依赖，Node 18+）
 *
 * 设计目标：替代 Supabase —— 邮箱/密码登录 + 一张 entries 表 + 静态站托管。
 * 只绑定 127.0.0.1，由 Lucky 反向代理对外（clip.evenhoo.top）。
 *
 * 数据：<root>/data/store.json（原子写入 + .bak 轮转）
 * 密钥：<root>/data/secret.key（0600，Token 签名用）
 */
import { createServer } from 'node:http'
import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const DATA_DIR = process.env.EC_DATA_DIR || join(ROOT, 'data')
const WEB_DIR = process.env.EC_WEB_DIR || join(ROOT, 'web')
const HOST = process.env.EC_HOST || '127.0.0.1'
const PORT = Number(process.env.EC_PORT || 4188)
const STORE_FILE = join(DATA_DIR, 'store.json')
const SECRET_FILE = join(DATA_DIR, 'secret.key')
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90
const MAX_BODY_BYTES = 12 * 1024 * 1024
const ALLOWED_ORIGINS = (
  process.env.EC_ALLOWED_ORIGINS ||
  'https://english-clip.vercel.app,https://clip.evenhoo.top:8443,http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

mkdirSync(DATA_DIR, { recursive: true })

/* ── 密钥 ─────────────────────────────────────────────── */

function loadSecret() {
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  writeFileSync(SECRET_FILE, secret + '\n', { mode: 0o600 })
  try {
    chmodSync(SECRET_FILE, 0o600)
  } catch {
    /* 忽略 */
  }
  return secret
}
const SECRET = loadSecret()

/* ── 存储 ─────────────────────────────────────────────── */

const EMPTY_STORE = { version: 1, users: {}, entries: {}, inviteCode: '' }
let store = structuredClone(EMPTY_STORE)

function loadStore() {
  if (!existsSync(STORE_FILE)) {
    store = structuredClone(EMPTY_STORE)
    store.inviteCode = randomBytes(4).toString('hex')
    saveStore()
    writeFileSync(join(DATA_DIR, 'invite-code.txt'), store.inviteCode + '\n')
    log(`首次启动：已生成邀请码 ${store.inviteCode}（写入 data/invite-code.txt）`)
    return
  }
  const raw = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
  store = { ...structuredClone(EMPTY_STORE), ...raw }
  store.users ||= {}
  store.entries ||= {}
  if (!store.inviteCode) store.inviteCode = randomBytes(4).toString('hex')
}

export function saveStore() {
  store.savedAt = new Date().toISOString()
  const tmp = STORE_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(store))
  if (existsSync(STORE_FILE)) {
    try {
      copyFileSync(STORE_FILE, STORE_FILE + '.bak')
    } catch {
      /* 忽略 */
    }
  }
  renameSync(tmp, STORE_FILE)
}

/* ── 工具 ─────────────────────────────────────────────── */

const log = (...args) => console.log(new Date().toISOString(), ...args)

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64url'),
  dec: (str) => Buffer.from(str, 'base64url'),
}

function hmac(data) {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(user.hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function makeToken(user) {
  const payload = {
    uid: user.id,
    ver: user.tokenVersion || 0,
    exp: Date.now() + TOKEN_TTL_MS,
  }
  const body = b64u.enc(JSON.stringify(payload))
  return `${body}.${hmac(body)}`
}

function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = hmac(body)
  if (
    expect.length !== sig.length ||
    !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))
  ) {
    return null
  }
  let payload
  try {
    payload = JSON.parse(b64u.dec(body).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    return null
  }
  const user = store.users[payload.uid]
  if (!user) return null
  if ((user.tokenVersion || 0) !== payload.ver) return null
  return user
}

const publicUser = (user) => ({ id: user.id, email: user.email })

/* ── HTTP 辅助 ────────────────────────────────────────── */

function applyCors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('JSON 解析失败'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

const bearer = (req) => {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

/* ── 认证限流（防爆破）───────────────────────────────── */

const failures = new Map()
const FAIL_LIMIT = 8
const FAIL_WINDOW_MS = 15 * 60 * 1000

function tooManyFailures(ip) {
  const entry = failures.get(ip)
  if (!entry) return false
  if (Date.now() - entry.first > FAIL_WINDOW_MS) {
    failures.delete(ip)
    return false
  }
  return entry.count >= FAIL_LIMIT
}

function noteFailure(ip) {
  const entry = failures.get(ip)
  if (!entry || Date.now() - entry.first > FAIL_WINDOW_MS) {
    failures.set(ip, { first: Date.now(), count: 1 })
    return
  }
  entry.count += 1
}

/* ── 静态文件 ─────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function serveStatic(req, res, urlPath) {
  if (!existsSync(WEB_DIR)) {
    return sendJson(res, 503, { ok: false, message: '前端尚未部署（缺少 web/ 目录）' })
  }
  let rel = decodeURIComponent(urlPath)
  if (rel.includes('\0')) return sendJson(res, 400, { ok: false, message: '非法路径' })
  if (rel === '/' || rel === '') rel = '/index.html'

  let filePath = resolve(join(WEB_DIR, rel))
  if (!filePath.startsWith(resolve(WEB_DIR) + sep) && filePath !== resolve(WEB_DIR)) {
    return sendJson(res, 400, { ok: false, message: '非法路径' })
  }

  // SPA 兜底：无扩展名或找不到的路径交给 index.html
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (extname(rel)) {
      return sendJson(res, 404, { ok: false, message: '未找到' })
    }
    filePath = join(WEB_DIR, 'index.html')
    if (!existsSync(filePath)) {
      return sendJson(res, 404, { ok: false, message: '未找到' })
    }
  }

  const ext = extname(filePath).toLowerCase()
  const base = filePath.slice(filePath.lastIndexOf(sep) + 1)
  const immutable = filePath.includes(`${sep}assets${sep}`)
  const noCache = base === 'index.html' || base === 'sw.js'
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': noCache
      ? 'no-cache, must-revalidate'
      : immutable
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
  }
  const body = readFileSync(filePath)
  headers['Content-Length'] = body.length
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  res.end(body)
}

/* ── API ──────────────────────────────────────────────── */

async function handleApi(req, res, url) {
  const path = url.pathname

  if (path === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      accountExists: Object.keys(store.users).length > 0,
      userCount: Object.keys(store.users).length,
    })
  }

  if (path === '/api/auth/register' && req.method === 'POST') {
    if (tooManyFailures(req.socket.remoteAddress || '')) {
      return sendJson(res, 429, { ok: false, message: '尝试过多，请稍后再试' })
    }
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { ok: false, message: '邮箱格式不正确' })
    }
    if (password.length < 6) {
      return sendJson(res, 400, { ok: false, message: '密码至少 6 位' })
    }
    if (Object.values(store.users).some((u) => u.email === email)) {
      return sendJson(res, 409, { ok: false, message: '该邮箱已注册，请直接登录' })
    }
    const firstUser = Object.keys(store.users).length === 0
    if (!firstUser) {
      const invite = String(body.inviteCode || '').trim()
      if (invite !== store.inviteCode) {
        return sendJson(res, 403, { ok: false, message: '需要邀请码才能注册新账号' })
      }
    }
    const { salt, hash } = hashPassword(password)
    const user = {
      id: randomUUID(),
      email,
      salt,
      hash,
      tokenVersion: 0,
      createdAt: new Date().toISOString(),
    }
    store.users[user.id] = user
    store.entries[user.id] ||= {}
    saveStore()
    log('注册新账号', email)
    return sendJson(res, 200, { ok: true, token: makeToken(user), user: publicUser(user) })
  }

  if (path === '/api/auth/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || ''
    if (tooManyFailures(ip)) {
      return sendJson(res, 429, { ok: false, message: '尝试过多，请稍后再试' })
    }
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    const user = Object.values(store.users).find((u) => u.email === email)
    if (!user || !checkPassword(user, password)) {
      noteFailure(ip)
      return sendJson(res, 401, { ok: false, message: '邮箱或密码不正确' })
    }
    failures.delete(ip)
    return sendJson(res, 200, { ok: true, token: makeToken(user), user: publicUser(user) })
  }

  const user = readToken(bearer(req))

  if (path === '/api/auth/me' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' })
    return sendJson(res, 200, { ok: true, user: publicUser(user) })
  }

  if (path === '/api/auth/logout' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' })
    user.tokenVersion = (user.tokenVersion || 0) + 1
    saveStore()
    return sendJson(res, 200, { ok: true, message: '已退出登录' })
  }

  if (path === '/api/entries' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' })
    const entries = Object.values(store.entries[user.id] || {})
    return sendJson(res, 200, { ok: true, entries })
  }

  if (path === '/api/entries' && req.method === 'POST') {
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' })
    const body = await readBody(req)
    const incoming = Array.isArray(body.entries) ? body.entries : []
    const bucket = (store.entries[user.id] ||= {})
    let accepted = 0
    let skipped = 0
    for (const entry of incoming) {
      if (!entry || typeof entry.id !== 'string' || !entry.id) continue
      const current = bucket[entry.id]
      if (current && String(current.updatedAt) > String(entry.updatedAt)) {
        skipped += 1
        continue
      }
      bucket[entry.id] = entry
      accepted += 1
    }
    saveStore()
    return sendJson(res, 200, {
      ok: true,
      accepted,
      skipped,
      total: Object.keys(bucket).length,
      message: `已同步 ${accepted} 条`,
    })
  }

  if (path === '/api/export' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' })
    const entries = Object.values(store.entries[user.id] || {})
    const stamp = new Date().toISOString().slice(0, 10)
    const body = Buffer.from(JSON.stringify(entries, null, 2))
    const filename = `english-clip-${stamp}.json`
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    })
    return res.end(body)
  }

  return sendJson(res, 404, { ok: false, message: '接口不存在' })
}

/* ── 服务器 ───────────────────────────────────────────── */

const startedAt = Date.now()

const server = createServer(async (req, res) => {
  const began = Date.now()
  const ip = req.socket.remoteAddress || '-'
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        stage: 'production',
        users: Object.keys(store.users).length,
        entries: Object.values(store.entries).reduce(
          (sum, bucket) => sum + Object.keys(bucket).length,
          0,
        ),
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        version: 'english-clip-nas-1',
      })
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname)
    } else {
      sendJson(res, 405, { ok: false, message: '方法不允许' })
    }
  } catch (error) {
    const status = error && error.status ? error.status : 500
    if (status >= 500) log('错误', url.pathname, error && error.message)
    if (!res.headersSent) {
      sendJson(res, status, { ok: false, message: (error && error.message) || '服务器错误' })
    } else {
      res.end()
    }
  } finally {
    log(`${req.method} ${url.pathname} -> ${res.statusCode} ${Date.now() - began}ms ${ip}`)
  }
})

server.listen(PORT, HOST, () => {
  loadStore()
  log(`English Clip 后端已启动 http://${HOST}:${PORT}`)
  log(`静态目录 ${WEB_DIR}`)
  log(`数据文件 ${STORE_FILE}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`收到 ${signal}，关闭中`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  })
}
