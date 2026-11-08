import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export function createProgressStore(root) {
  const file = join(root, 'progress.json')
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const read = item => data[item.ownerId]?.[item.id] || { revision: 0, readingPosition: item.readingPosition, playbackPosition: item.playbackPosition }
  return {
    read,
    write(item, body, legacy = false) {
      const previous = read(item)
      if (typeof body.mutationId === 'string' && body.mutationId === previous.mutationId) return { progress: previous }
      if (!legacy && body.revision !== previous.revision) return { conflict: true, progress: previous }
      const next = { ...previous, revision: previous.revision + 1, mutationId: typeof body.mutationId === 'string' ? body.mutationId.slice(0, 64) : undefined, lastStudiedAt: new Date().toISOString() }
      if (Number.isFinite(body.playbackPosition)) next.playbackPosition = Math.max(0, Math.min(86400, body.playbackPosition))
      if (body.readingPosition && item.kind === 'book') {
        const { chapter, paragraph } = body.readingPosition
        if (!Number.isInteger(chapter) || !Number.isInteger(paragraph) || chapter < 0 || paragraph < 0 || chapter >= (item.chapters?.length || 0) || paragraph >= item.chapters[chapter].paragraphs.length) throw Object.assign(Error('阅读位置无效'), { status: 400 })
        next.readingPosition = { chapter, paragraph }
      }
      const nextData = { ...data, [item.ownerId]: { ...data[item.ownerId], [item.id]: next } }
      writeFileSync(file + '.tmp', JSON.stringify(nextData), { mode: 0o600 })
      if (existsSync(file)) writeFileSync(file + '.bak', readFileSync(file), { mode: 0o600 })
      renameSync(file + '.tmp', file)
      data[item.ownerId] = nextData[item.ownerId]
      return { progress: next }
    },
  }
}
