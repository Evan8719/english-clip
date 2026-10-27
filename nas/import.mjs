#!/usr/bin/env node
/**
 * 把旧版（Vercel/Supabase 时期）导出的 JSON 合并进自建后端的数据库。
 *
 * 用法（在 NAS 宿主机上，先停服务再跑，避免内存副本覆盖）：
 *   EC_RESTART=1 ... run.sh 前先 kill；见 README
 *   node import.mjs <entries.json> <邮箱>
 *
 * 合并规则与前端一致：同一个 id 按 updatedAt 取新。
 * 只写 data/store.json，不碰别的。
 */
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const DATA_DIR = process.env.EC_DATA_DIR || join(__dirname, '..', 'data')
const STORE_FILE = join(DATA_DIR, 'store.json')

const [input, emailArg] = process.argv.slice(2)
if (!input) {
  console.error('用法: node import.mjs <entries.json> [邮箱]')
  process.exit(1)
}
if (!existsSync(input)) {
  console.error('找不到文件:', input)
  process.exit(1)
}
if (!existsSync(STORE_FILE)) {
  console.error('找不到数据库:', STORE_FILE, '（后端是否已启动过？）')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(input, 'utf8'))
// 兼容三种形状：裸数组 / {entries:[...]} / {数据:[...]}
const incoming = Array.isArray(raw) ? raw : raw.entries || raw.数据 || []
if (!incoming.length) {
  console.error('文件里没有词条')
  process.exit(1)
}

const store = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
store.users ||= {}
store.entries ||= {}

const users = Object.values(store.users)
const user = emailArg
  ? users.find((u) => u.email === String(emailArg).trim().toLowerCase())
  : users.length === 1
    ? users[0]
    : null

if (!user) {
  console.error(
    users.length
      ? `请指定邮箱，现有账号：${users.map((u) => u.email).join(', ')}`
      : '数据库里还没有账号。请先在新版 app 里注册一次，再跑导入。',
  )
  process.exit(1)
}

const bucket = (store.entries[user.id] ||= {})
let added = 0
let updated = 0
let skipped = 0

for (const entry of incoming) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) continue
  const current = bucket[entry.id]
  if (!current) {
    bucket[entry.id] = entry
    added += 1
  } else if (String(current.updatedAt) >= String(entry.updatedAt)) {
    skipped += 1
  } else {
    bucket[entry.id] = entry
    updated += 1
  }
}

store.savedAt = new Date().toISOString()
copyFileSync(STORE_FILE, STORE_FILE + '.before-import')
const tmp = STORE_FILE + '.tmp'
writeFileSync(tmp, JSON.stringify(store))
renameSync(tmp, STORE_FILE)

console.log(`导入到 ${user.email}`)
console.log(`  新增 ${added} 条，更新 ${updated} 条，跳过（服务器上更新） ${skipped} 条`)
console.log(`  该账号现有 ${Object.keys(bucket).length} 条`)
console.log(`  备份：${STORE_FILE}.before-import`)
