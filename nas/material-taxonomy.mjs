import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

const libraries = ['audio', 'book', 'course', 'lesson', 'link']
const clean = value => String(value || '').trim().slice(0, 100)
const tags = values => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))].slice(0, 20)
const stableId = value => 'legacy-' + createHash('sha256').update(value).digest('hex').slice(0, 24)
function suggestion(item) {
  let library = item.courseId ? 'course' : ['book', 'text'].includes(item.kind) ? 'book' : ['lesson', 'link'].includes(item.kind) ? item.kind : 'audio'
  let category = library === 'book' ? item.kind === 'text' ? '短文' : '电子书' : library === 'audio' ? '待整理听力' : '待分类'
  let title = '待整理', purposes = []
  if (item.courseId) { title = item.courseId === 'family-album' ? '走遍美国' : item.source || item.courseId; category = '系列课程' }
  else if (library === 'audio') {
    const text = `${item.source || ''} ${item.title}`
    for (const [pattern, name, purpose] of [[/esl[\s_-]*pod\b/i,'ESLPod','慢速讲解'],[/\blife[\s_-]*kit\b/i,'Life Kit','生活实用'],[/\bplanet[\s_-]*money\b/i,'Planet Money','叙事逻辑'],[/\bthe[\s_-]*indicator\b/i,'The Indicator','短篇观点'],[/\bthe[\s_-]*daily\b/i,'The Daily','新闻叙事'],[/\bhow[\s_-]*i[\s_-]*built[\s_-]*this\b/i,'How I Built This','长访谈']]) {
      if (pattern.test(text)) { title = name; purposes = [purpose]; category = '播客'; break }
    }
    if (title === '待整理' && /\belllo\b/i.test(item.source || '')) { title = 'ELLLO'; category = '带文稿听力' }
    if (title === '待整理' && String(item.transcript || '').trim()) { title = '带文稿听力'; category = '带文稿听力' }
  } else if (library === 'lesson') { title = item.source || '待整理'; category = '学习视频' }
  else if (library === 'link') { title = '个人链接'; category = '外部资源' }
  else if (library === 'book') title = item.kind === 'text' ? '短文集' : '书籍'
  const id = stableId(`${library}:${category}:${item.courseId || title}`)
  return { collection: { id, library, category, title, purposes, inferred: title === '待整理' }, sequence: item.episode || 0 }
}

export function createMaterialTaxonomy(root, getItems) {
  const file = join(root, 'taxonomy.json')
  const stored = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  if (stored.schemaVersion && stored.schemaVersion !== 1) throw Error('不支持的素材分类版本')
  const data = stored.accounts || stored
  function bucket(uid) { return data[uid] || { collections: {}, placements: {} } }
  function collections(uid) {
    const result = new Map(getItems(uid).filter(item => !bucket(uid).placements[item.id]).map(item => { const value = suggestion(item).collection; return [value.id, value] }))
    for (const value of Object.values(bucket(uid).collections)) result.set(value.id, value)
    return [...result.values()]
  }
  function resolve(item) {
    const source = suggestion(item), saved = bucket(item.ownerId).placements[item.id]
    const collection = collections(item.ownerId).find(c => c.id === (saved?.collectionId || source.collection.id)) || source.collection
    return { library: collection.library, category: collection.category, collectionId: collection.id, collectionTitle: collection.title, purposes: saved?.purposes ?? collection.purposes, inheritedPurposes: saved?.purposes === undefined, topics: saved?.topics || [], sequence: saved?.sequence ?? source.sequence, inferred: !saved && collection.inferred === true }
  }
  function persist(uid, next) {
    const output = { ...data, [uid]: next }
    writeFileSync(file + '.tmp', JSON.stringify({ schemaVersion: 1, accounts: output }), { mode: 0o600 })
    if (existsSync(file)) writeFileSync(file + '.bak', readFileSync(file), { mode: 0o600 })
    renameSync(file + '.tmp', file); data[uid] = next
  }
  function saveCollection(uid, body) {
    const previous = body.id ? collections(uid).find(c => c.id === body.id) : null
    if (body.id && !previous) throw Object.assign(Error('节目或系列不存在'), { status: 404 })
    if (!libraries.includes(body.library) || !clean(body.title) || !clean(body.category)) throw Object.assign(Error('请选择主库并填写类别、节目或系列名称'), { status: 400 })
    if (previous && previous.library !== body.library) throw Object.assign(Error('请新建目标分组，再调整素材归属'), { status: 400 })
    const duplicate = collections(uid).find(c => c.library === body.library && c.category === clean(body.category) && c.title.toLowerCase() === clean(body.title).toLowerCase() && c.id !== previous?.id)
    if (duplicate) throw Object.assign(Error('该分组已存在，请选择已有分组'), { status: 409 })
    const value = { id: previous?.id || randomUUID(), library: body.library, category: clean(body.category), title: clean(body.title), aliases: tags([...(previous?.aliases || []), previous?.title]).filter(value => value !== clean(body.title)), purposes: tags(body.purposes), inferred: false }
    const old = bucket(uid); persist(uid, { ...old, collections: { ...old.collections, [value.id]: value } }); return value
  }
  function place(uid, item, body) {
    const collection = collections(uid).find(c => c.id === body.collectionId)
    if (!collection) throw Object.assign(Error('请先选择已有分组'), { status: 400 })
    if ((item.kind === 'link' && collection.library !== 'link') || (item.kind === 'lesson' && collection.library !== 'lesson') || (collection.library === 'link' && item.kind !== 'link') || (collection.library === 'lesson' && item.kind !== 'lesson') || (item.kind === 'book' && collection.library !== 'book')) throw Object.assign(Error('此类素材不能移到该主库'), { status: 400 })
    const value = { collectionId: collection.id, topics: tags(body.topics), originPath: clean(body.originPath || bucket(uid).placements[item.id]?.originPath), sequence: Math.max(0, Math.min(100000, Math.floor(Number(body.sequence) || 0))) }
    if (body.purposes !== null && body.purposes !== undefined) value.purposes = tags(body.purposes)
    const old = bucket(uid); persist(uid, { ...old, collections: { ...old.collections, [collection.id]: collection }, placements: { ...old.placements, [item.id]: value } })
    return resolve(item)
  }
  return { collections, resolve, saveCollection, place }
}
