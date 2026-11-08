import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const MAX = 2500000
function png(bytes, limit) {
  if (bytes.length < 33 || bytes.length > MAX || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw Object.assign(Error('请选择有效图片后重新上传'), { status: 400 })
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > limit || height > limit) throw Object.assign(Error('图片尺寸超出限制'), { status: 400 })
}
export function createMediaCovers(root, secret, sendJson) {
  const dir = join(root, 'covers'), file = join(dir, 'index.json')
  mkdirSync(dir, { recursive: true })
  let index = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const signature = value => createHmac('sha256', secret).update(value).digest('hex')
  function save(next) { writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); if (existsSync(file)) writeFileSync(file + '.bak', readFileSync(file), { mode: 0o600 }); renameSync(file + '.tmp', file); index = next }
  function urls(uid, kind, id) {
    const value = index[uid]?.[`${kind}:${id}`]
    if (!value) return {}
    const exp = Math.floor(Date.now() / 1000) + 3600
    const url = hash => `/api/media-covers/${uid}/${kind}/${id}?v=${hash}&exp=${exp}&sig=${signature(`${uid}:${kind}:${id}:${hash}:${exp}`)}`
    return { coverUrl: url(value.thumb), coverFullUrl: url(value.full) }
  }
  async function handle(req, res, url, user, exists) {
    const match = /^\/api\/media-covers\/([a-zA-Z0-9-]{1,80})\/(item|collection)\/([a-zA-Z0-9-]{1,80})$/.exec(url.pathname)
    if (!match) return false
    const [, uid, kind, id] = match, key = `${kind}:${id}`
    if (req.method === 'GET' || req.method === 'HEAD') {
      const hash = url.searchParams.get('v') || '', exp = Number(url.searchParams.get('exp')), sig = url.searchParams.get('sig') || ''
      const expected = signature(`${uid}:${kind}:${id}:${hash}:${exp}`)
      if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isSafeInteger(exp) || exp < Date.now() / 1000 || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return sendJson(res, 403, { message: '封面链接已过期，请刷新列表' })
      const value = index[uid]?.[key]
      if (!value || ![value.thumb, value.full].includes(hash)) return sendJson(res, 404, { message: '封面不存在' })
      const path = join(dir, `${uid}-${hash}.png`)
      if (!existsSync(path)) return sendJson(res, 404, { message: '封面文件不存在' })
      const bytes = readFileSync(path)
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=1800', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : bytes); return true
    }
    if (!user || user.id !== uid) return sendJson(res, 401, { message: '未登录或无权修改封面' })
    if (!exists(uid, kind, id)) return sendJson(res, 404, { message: '素材或分组不存在' })
    if (req.method === 'DELETE') { const next = { ...index, [uid]: { ...index[uid] } }; delete next[uid][key]; save(next); return sendJson(res, 200, { ok: true }) }
    if (req.method !== 'PUT') return sendJson(res, 405, { message: '方法不允许' })
    const split = Number(req.headers['x-cover-thumb-length'])
    if (!Number.isSafeInteger(split) || split <= 0 || split > MAX) return sendJson(res, 400, { message: '图片数据不完整' })
    const chunks = []; let length = 0
    for await (const chunk of req) { length += chunk.length; if (length > MAX) throw Object.assign(Error('图片过大，请缩小后重试'), { status: 413 }); chunks.push(chunk) }
    const bytes = Buffer.concat(chunks), thumb = bytes.subarray(0, split), full = bytes.subarray(split)
    png(thumb, 240); png(full, 960)
    const hashes = [thumb, full].map(buffer => { const hash = createHash('sha256').update(buffer).digest('hex'); const path = join(dir, `${uid}-${hash}.png`); if (!existsSync(path)) { writeFileSync(path + '.tmp', buffer, { mode: 0o600 }); renameSync(path + '.tmp', path) } return hash })
    save({ ...index, [uid]: { ...index[uid], [key]: { thumb: hashes[0], full: hashes[1] } } })
    return sendJson(res, 200, { ok: true, ...urls(uid, kind, id) })
  }
  return { urls, handle }
}
