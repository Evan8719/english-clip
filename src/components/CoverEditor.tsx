import { useEffect, useRef, useState } from 'react'
import { authorizedApiFetch, getStoredUserId } from '../lib/sync'

export function CoverEditor({ kind, id, title, onDone }: { kind: 'item' | 'collection'; id: string; title: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const [preview, setPreview] = useState('')
  useEffect(() => { if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) { setPreview(''); return } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])
  async function save(reset = false) {
    const uid = getStoredUserId(); if (!uid || (!file && !reset)) return
    setBusy(true); setMessage('')
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 30000)
    try {
      let body: Blob | undefined, thumbLength = 0
      if (!reset && file) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw Error('请选择 20 MB 内的 PNG、JPEG 或 WebP 图片')
        const bitmap = await createImageBitmap(file)
        try {
          if (bitmap.width * bitmap.height > 24000000) throw Error('图片分辨率过大，请先缩小后上传')
          const resize = async (edge: number) => { const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('图片转换失败')), 'image/png')) }
          const thumb = await resize(240), full = await resize(960); thumbLength = thumb.size; body = new Blob([thumb, full]); if (body.size > 2500000) throw Error('图片内容过大，请缩小图片后重试')
        } finally { bitmap.close() }
      }
      if (uid !== getStoredUserId()) throw Error('账号已切换，请重新打开封面设置')
      const response = await authorizedApiFetch(`/api/media-covers/${uid}/${kind}/${id}`, { method: reset ? 'DELETE' : 'PUT', body, signal: controller.signal, headers: reset ? {} : { 'Content-Type': 'application/octet-stream', 'X-Cover-Thumb-Length': String(thumbLength) } })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw Error(data.message || '封面保存失败')
      if (alive.current && uid === getStoredUserId()) onDone()
    } catch (error) { setMessage((error as Error).name === 'AbortError' ? '保存等待超时，请刷新列表确认结果后重试' : (error as Error).message) } finally { window.clearTimeout(timer); setBusy(false) }
  }
  return <div className="cover-editor"><p>{title}</p><label>选择封面<input aria-label="选择封面图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setMessage('') }} /></label>{preview && <img className="cover-editor-preview" src={preview} alt="待保存封面预览" />}<p className="muted tiny">自动保存小缩略图与详情图，原素材与阅读进度不变。</p>{message && <p role="alert">{message}</p>}<div className="cover-editor-actions"><button className="redesign-primary" disabled={busy || !file} onClick={() => void save()}>{busy ? '保存中…' : '保存封面'}</button><button className="chip" disabled={busy} onClick={() => void save(true)}>恢复默认</button></div></div>
}
