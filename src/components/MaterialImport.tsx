import { useState } from 'react'
import { cleanTranscript, contentHash, estimateLevel, LEVELS, parseEpub, type BookData } from '../lib/books'
import { uploadMedia, type MediaItem } from '../lib/media'

interface Row { file: File; title: string; transcript: string; level: string; book?: BookData; status: string }
export function MaterialImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
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
        const matching = all.find((f) => /\.(txt|srt|vtt)$/i.test(f.name) && stem(f) === stem(file))
        const transcript = matching ? cleanTranscript(await matching.text()) : ''
        const text = book ? book.chapters.slice(0, 6).flatMap((c) => c.paragraphs).join(' ') : transcript
        result.push({ file, book, transcript, title: book?.title || file.name.replace(/\.[^.]+$/, ''), level: estimateLevel(text), status: book ? `${book.chapters.length} 节 · 正文可读` : matching ? '已匹配文稿' : '无文稿 · 可在本机转写' })
      } catch { result.push({ file, title: file.name, transcript: '', level: '', status: '文件无法读取，请重新下载' }) }
    }
    setRows(result); setBusy(false); setMessage(result.length ? '检查配对和参考等级后开始导入。等级按文本长度与句子结构粗估，可手动调整。' : '请选择音视频或 EPUB，可同时选择同名文稿。')
  }
  async function importAll() {
    setBusy(true)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.status === '文件无法读取，请重新下载' || row.status === '已入库') continue
      setMessage(`正在导入 ${i + 1} / ${rows.length}：${row.title}`)
      try {
        const kind: MediaItem['kind'] = row.book ? 'book' : /\.(mp4|mov)$/i.test(row.file.name) ? 'video' : 'audio'
        await uploadMedia({ title: row.title, source: row.book?.author || '私人素材', kind, transcript: row.transcript, chapters: row.book?.chapters, author: row.book?.author, level: row.level, levelBasis: '文本估算／可调整', contentHash: await contentHash(row.file), file: row.file })
        row.status = '已入库'
      } catch (error) { row.status = `失败：${(error as Error).message}` }
      setRows([...rows])
    }
    setBusy(false); setMessage('导入已完成，失败的文件可重试；相同内容会自动跳过。'); onDone()
  }
  return <div className="material-import"><div className="media-section-head"><h2>批量导入与自动匹配</h2><button className="redesign-text-button" disabled={busy} onClick={onClose}>关闭</button></div><p>一起选择音频和同名 TXT / SRT / VTT；也可以加入 EPUB。原始等级仅作参考，不当作正式分级。</p><input type="file" multiple aria-label="选择素材和文稿" accept=".epub,.mp3,.m4a,.wav,.mp4,.webm,.mov,.ogg,.txt,.srt,.vtt" disabled={busy} onChange={(event) => void prepare(event.target.files)} />
    {rows.map((row, index) => <div className="import-preview-row" key={`${index}-${row.file.name}`}><div><strong>{row.title}</strong><small>{row.status}</small></div><select aria-label={`${row.title} 等级`} value={row.level} disabled={busy} onChange={(event) => { row.level = event.target.value; setRows([...rows]) }}><option value="">待评估</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></div>)}
    <p role="status">{message}</p>{rows.length > 0 && <button className="redesign-primary" disabled={busy} onClick={() => void importAll()}>{busy ? '正在处理…' : `开始导入 ${rows.filter((r) => r.status !== '文件无法读取，请重新下载').length} 份`}</button>}
  </div>
}
