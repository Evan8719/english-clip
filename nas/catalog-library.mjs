// Human-readable hard-link catalog. Original IDs and files remain compatible.
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const clean = value => {
  const chars = Array.from(String(value || '').normalize('NFC').replace(/\p{Cc}/gu, ' ').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '')).slice(0, 100)
  while (Buffer.byteLength(chars.join(''), 'utf8') > 160) chars.pop()
  const name = chars.join('') || '未命名'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `文件-${name}` : name
}
function within(root, path) {
  const full = resolve(root, path)
  if (!full.startsWith(resolve(root) + sep)) throw Error('Catalog path escapes library')
  return full
}
const sameFile = (a, b) => { const x = statSync(a), y = statSync(b); return x.dev === y.dev && x.ino === y.ino }
const timestamp = seconds => { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
const srt = (segments, field) => segments.filter(s => s[field]).map((s, i) => `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${s[field]}\n`).join('\n')
function writeChanged(file, content) {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return
  writeFileSync(`${file}.next`, content, { mode: 0o600 }); renameSync(`${file}.next`, file)
}

export function catalogItem(item, dataDir, libraryDir, moved = new Map()) {
  if (!item.extension) return null
  if (!/^[a-z0-9-]+$/i.test(item.ownerId) || !/^[a-z0-9-]+$/i.test(item.id) || !/^[a-z0-9]+$/i.test(item.extension)) throw Error('Invalid original identity')
  const original = within(dataDir, `media/files/${item.ownerId}/${item.id}.${item.extension}`)
  if (!existsSync(original)) throw Error('Original file is missing')
  mkdirSync(libraryDir, { recursive: true, mode: 0o700 })
  let target = item.libraryPath ? within(libraryDir, item.libraryPath) : null
  const sourceStat = statSync(original)
  if (!target || !existsSync(target)) target = moved.get(`${sourceStat.dev}:${sourceStat.ino}`) || null
  if (!target) {
    const group = item.kind === 'book' ? '电子书' : item.kind === 'audio' ? '音频' : item.kind === 'lesson' ? '视频/精选' : '视频'
    const series = clean(item.source || item.author || '我的素材')
    target = within(libraryDir, `${group}/${series}/${clean(item.title)}.${item.extension}`)
    if (existsSync(target) && !sameFile(original, target)) target = within(libraryDir, `${group}/${series}/${clean(item.title)} (${item.id.slice(0, 8)}).${item.extension}`)
  }
  // Reject symlink aliases and escaping parent directories, never overwrite.
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const realRoot = realpathSync(libraryDir)
  if (!realpathSync(dirname(target)).startsWith(realRoot + sep)) throw Error('Catalog parent escapes library')
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || !sameFile(original, target)) throw Error('Catalog filename conflict')
  } else linkSync(original, target)
  item.libraryPath = relative(libraryDir, target).split(sep).join('/')
  const stem = target.slice(0, -(item.extension.length + 1))
  if (item.transcript) writeChanged(`${stem}.原文.txt`, item.transcript + '\n')
  if (item.segments?.length) {
    writeChanged(`${stem}.en.srt`, srt(item.segments, 'text'))
    if (item.segments.some(s => s.translation)) writeChanged(`${stem}.zh.srt`, srt(item.segments, 'translation'))
    writeChanged(`${stem}.words.json`, JSON.stringify({ id: item.id, title: item.title, contentHash: item.contentHash, segments: item.segments }))
  }
  writeChanged(`${stem}.资料.json`, JSON.stringify({ id: item.id, title: item.title, kind: item.kind, level: item.level, source: item.source, sourceUrl: item.sourceUrl, contentHash: item.contentHash, file: basename(target) }, null, 2) + '\n')
  return item.libraryPath
}

function knownInodes(root, map = new Map()) {
  if (!existsSync(root)) return map
  for (const name of readdirSync(root)) {
    const file = join(root, name), stat = lstatSync(file)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) knownInodes(file, map)
    else if (/\.(mp3|m4a|wav|ogg|webm|mp4|mov|epub)$/i.test(name)) map.set(`${stat.dev}:${stat.ino}`, file)
  }
  return map
}

export function catalogLibrary(dataDir, libraryDir) {
  const indexFile = join(dataDir, 'media', 'index.json'), index = JSON.parse(readFileSync(indexFile, 'utf8'))
  const moved = knownInodes(libraryDir), rows = []
  for (const items of Object.values(index)) for (const item of Object.values(items)) {
    const path = catalogItem(item, dataDir, libraryDir, moved)
    if (path) rows.push({ title: item.title, kind: item.kind, level: item.level || '', file: path, id: item.id, sha256: item.contentHash || '' })
  }
  writeChanged(indexFile, JSON.stringify(index))
  writeCatalogIndex(index, libraryDir)
  return { cataloged: rows.length, originalsCopied: 0, method: 'hard-links', sidecars: 'text/srt/word-json', legacyPathsPreserved: true }
}

export function writeCatalogIndex(index, libraryDir) {
  mkdirSync(libraryDir, { recursive: true, mode: 0o700 })
  const rows = Object.values(index).flatMap(Object.values).filter(item => item.libraryPath).map(item => ({ title: item.title, kind: item.kind, level: item.level || '', file: item.libraryPath, id: item.id, sha256: item.contentHash || '' }))
  const quote = value => { const text = String(value); return `"${(/^[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"` }
  writeChanged(join(libraryDir, '资料目录.csv'), '\uFEFF' + [['标题', '类型', '参考等级', '文件', '素材ID', 'SHA256'], ...rows.map(row => Object.values(row))].map(row => row.map(quote).join(',')).join('\n') + '\n')
  writeChanged(join(libraryDir, 'catalog.json'), JSON.stringify({ version: 1, items: rows }, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--offline' || !process.env.EC_DATA_DIR || !process.env.EC_LIBRARY_DIR) throw Error('Use EC_DATA_DIR=<data> EC_LIBRARY_DIR=<library> node catalog-library.mjs --offline with writer stopped')
  if (process.env.EC_PID_FILE && existsSync(process.env.EC_PID_FILE)) {
    let running = false
    try { process.kill(Number(readFileSync(process.env.EC_PID_FILE, 'utf8')), 0); running = true } catch {}
    if (running) throw Error('Stop backend writer before updating catalog')
  }
  console.log(JSON.stringify(catalogLibrary(resolve(process.env.EC_DATA_DIR), resolve(process.env.EC_LIBRARY_DIR))))
}
