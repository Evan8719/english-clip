import { CollectionEditor } from './MaterialOrganization'
import { useState } from 'react'
import { cleanTranscript, contentHash, estimateLevel, LEVELS, parseEpub, parseTimedTranscript, type BookData } from '../lib/books'
import { uploadMedia, type MaterialCollection, type MediaItem } from '../lib/media'

interface Row { file: File; title: string; transcript: string; level: string; levelBasis?: string; book?: BookData; status: string; collectionId?: string; originalPath?: string; sequence?: number; segments?: MediaItem['segments'] }
export function MaterialImport({ onClose, onDone, collections, onCollectionsChanged }: { onClose: () => void; onDone: () => void; collections: MaterialCollection[]; onCollectionsChanged: () => void }) {
  const [newCollection, setNewCollection] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function prepare(files: FileList | null) {
    if (!files) return
    setBusy(true); setMessage('正在配对文件与文稿…')
    const all = Array.from(files), result: Row[] = []
    const stem = (file: File) => file.name.replace(/\.[^.]+$/, '').toLowerCase()
    for (const file of all.filter((f) => /\.(epub|mp3|m4a|wav|mp4|webm|mov|ogg)$/i.test(f.name))) {
      try {
        const book = /\.epub$/i.test(file.name) ? await parseEpub(file) : undefined
        const matching = all.find((f) => /\.(txt|srt|vtt)$/i.test(f.name) && stem(f) === stem(file) && (f.webkitRelativePath?.split('/').slice(0,-1).join('/') || '') === (file.webkitRelativePath?.split('/').slice(0,-1).join('/') || ''))
        const raw = matching ? await matching.text() : ''
        const segments = parseTimedTranscript(raw)
        const transcript = segments.length ? segments.map((part) => part.text).join('\n') : cleanTranscript(raw)
        const text = book ? book.chapters.slice(0, 6).flatMap((c) => c.paragraphs).join(' ') : transcript
        result.push({ file, book, transcript, segments, title: book?.title || file.name.replace(/\.[^.]+$/, ''), level: estimateLevel(text), status: book ? `${book.chapters.length} 节 · 正文可读` : segments.length ? `已匹配 ${segments.length} 句时间字幕` : matching ? '已匹配文稿' : '无文稿 · 可在本机转写' })
      } catch { result.push({ file, title: file.name, transcript: '', level: '', status: '文件无法读取，请重新下载' }) }
    }
    const normalize = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, '')
    for (const row of result) {
      row.originalPath = row.file.webkitRelativePath || row.file.name
      const candidates = collections.filter(c => !['link','lesson'].includes(c.library) && (!row.book || c.library === 'book') && [c.title, ...(c.aliases || [])].some(name => normalize(row.file.name).includes(normalize(name))) && c.title !== '待整理')
      if (candidates.length === 1) row.collectionId = candidates[0].id
      if (!row.collectionId && row.book) {
        const books = collections.filter(c => c.library === 'book' && c.category === '电子书')
        if (books.length === 1) row.collectionId = books[0].id
      }
      if (!row.collectionId && /03_Listening_With_Transcript|带文稿听力/i.test(row.originalPath)) {
        const listening = collections.filter(c => c.library === 'audio' && c.category === '带文稿听力')
        if (listening.length === 1) row.collectionId = listening[0].id
      }
      if (!row.collectionId && /family[\s_-]*album|走遍美国/i.test(row.originalPath)) row.collectionId = collections.find(c => c.library === 'course' && c.title === '走遍美国')?.id
      const levelFromFolder = row.originalPath.match(/(?:^|\/)(A1|A2|B1|B2|C1|C2)[_\s]/i)?.[1]
      if (levelFromFolder) { row.level = levelFromFolder.toUpperCase(); row.levelBasis = '原目录参考／可调整' }
    }
    setRows(result); setBusy(false); setMessage(result.length ? '已自动匹配可识别的归属，必要时可调整。等级为目录参考或文本估算。' : '请选择音视频或 EPUB，可同时选择同名文稿。')
  }
  async function importAll() {
    setBusy(true)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.status === '文件无法读取，请重新下载' || row.status === '已入库') continue
      setMessage(`正在导入 ${i + 1} / ${rows.length}：${row.title}`)
      try {
        const kind: MediaItem['kind'] = row.book ? 'book' : row.file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(row.file.name) ? 'video' : 'audio'
        await uploadMedia({ title: row.title, source: row.book?.author || '私人素材', kind, transcript: row.transcript, segments: row.segments, chapters: row.book?.chapters, author: row.book?.author, level: row.level, importPath: row.originalPath, organization: row.collectionId ? { collectionId: row.collectionId, sequence: row.sequence, originPath: row.originalPath } : undefined, levelBasis: row.levelBasis || '文本估算／可调整', contentHash: await contentHash(row.file), file: row.file })
        row.status = '已入库'
      } catch (error) { row.status = `失败：${(error as Error).message}` }
      setRows([...rows])
    }
    setBusy(false); setMessage('导入已完成，失败的文件可重试；相同内容会跳过，原有归属保留。'); onDone()
  }
  return <div className="material-import"><div className="media-section-head"><h2>批量导入与自动匹配</h2><button className="redesign-text-button" disabled={busy} onClick={onClose}>关闭</button></div><p>一起选择音频和同名 TXT / SRT / VTT；也可以加入 EPUB。原始等级仅作参考，不当作正式分级。</p><input type="file" multiple aria-label="选择素材和文稿" accept=".epub,.mp3,.m4a,.wav,.mp4,.webm,.mov,.ogg,.txt,.srt,.vtt" disabled={busy} onChange={(event) => void prepare(event.target.files)} />
    <label className="folder-import">按原目录选择<input type="file" multiple aria-label="选择素材目录" {...{ webkitdirectory: '' }} disabled={busy} onChange={event => void prepare(event.target.files)} /></label>
    <button className="redesign-text-button" disabled={busy} onClick={() => setNewCollection(true)}>新建节目 / 系列</button>
    {newCollection && <CollectionEditor onCancel={() => setNewCollection(false)} onDone={() => { setNewCollection(false); onCollectionsChanged() }} />}
    {rows.map((row, index) => <div className="import-preview-row" key={`${index}-${row.file.name}`}><div><strong>{row.title}</strong><small>{row.status}</small><small>{row.originalPath}</small></div><select aria-label={`${row.title} 等级`} value={row.level} disabled={busy} onChange={(event) => { row.level = event.target.value; setRows([...rows]) }}><option value="">待评估</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select><label>归属<select aria-label={`${row.title} 归属`} value={row.collectionId || ''} disabled={busy || row.status === '已入库'} onChange={e => { row.collectionId = e.target.value; setRows([...rows]) }}><option value="">自动归类</option>{collections.filter(c => !['link','lesson'].includes(c.library) && (!row.book || c.library === 'book')).map(c => <option key={c.id} value={c.id}>{c.category} / {c.title}</option>)}</select></label><label>集数 / 课时<input aria-label={`${row.title} 序号`} type="number" min={0} max={100000} value={row.sequence || 0} disabled={busy} onChange={e => { row.sequence = Number(e.target.value); setRows([...rows]) }} /></label></div>)}
    <p role="status">{message}</p>{rows.length > 0 && <button className="redesign-primary" disabled={busy} onClick={() => void importAll()}>{busy ? '正在处理…' : `开始导入 ${rows.filter((r) => r.status !== '文件无法读取，请重新下载').length} 份`}</button>}
  </div>
}
