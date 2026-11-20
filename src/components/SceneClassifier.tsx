import { useEffect, useState } from 'react'
import { getEntry, updateEntry } from '../db/entries'
import { suggestScenes } from '../lib/media'
import { getNotebookId, getStoredUserId } from '../lib/session'
import { scheduleSilentSync } from '../lib/sync'
import type { Entry } from '../types'
import { MaterialSheet } from './MaterialSheet'
import { NavIcon } from './NavIcon'

export function SceneClassifier({ entries, scenes, onClose, onUpdated }: {
  entries: Entry[]
  scenes: string[]
  onClose: () => void
  onUpdated: () => void
}) {
  const [target, setTarget] = useState<Entry | null>(() => entries.length === 1 ? entries[0] : null)
  const [notebook] = useState(getNotebookId)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [choice, setChoice] = useState('')
  const [manual, setManual] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const signedIn = Boolean(getStoredUserId())

  useEffect(() => {
    if (!target) return
    setSuggestions([])
    setChoice(target.scene || '')
    setError('')
    if (!signedIn) return
    const request = new AbortController()
    setGenerating(true)
    void suggestScenes(target.text, target.context || '', scenes, request.signal).then(labels => {
      if (request.signal.aborted) return
      setSuggestions(labels)
      setChoice(target.scene || labels[0] || '')
    }).catch((error: Error) => {
      if (!request.signal.aborted) setError(error.message || '暂时无法生成建议')
    }).finally(() => {
      if (!request.signal.aborted) setGenerating(false)
    })
    return () => request.abort()
  }, [target, scenes, revision, signedIn])

  async function save(scene: string) {
    if (!target || saving) return
    setSaving(true)
    try {
      const current = await getEntry(target.id, notebook)
      if (getNotebookId() !== notebook || !current || current.text !== target.text || current.context !== target.context) {
        throw Error('词条已更改，请重新选择。')
      }
      const saved = await updateEntry(target.id, { scene: scene || undefined }, notebook)
      if (!saved) throw Error('找不到词条，请重新选择。')
      if (getNotebookId() !== notebook) return
      onUpdated()
      scheduleSilentSync()
      onClose()
    } catch (error) {
      setError((error as Error).message || '无法保存场景')
      setSaving(false)
    }
  }

  const scene = manual.trim().replace(/\s+/g, ' ') || choice
  const options = [...new Set([target?.scene, ...suggestions].filter((item): item is string => Boolean(item)))]
  return <MaterialSheet title={target ? 'AI 场景分类' : '选择词条'} onClose={onClose} busy={saving}>
    {!target ? <>
      <label className="field">搜索词条<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="app-action-menu scene-picker">{entries.filter(entry => entry.text.toLowerCase().includes(query.trim().toLowerCase())).map(entry =>
        <button key={entry.id} onClick={() => setTarget(entry)}><span>{entry.text}</span><NavIcon name="next" /></button>
      )}</div>
    </> : <section className="scene-suggestions">
      <h3 lang="en">{target.text}</h3>
      {target.context && <p className="muted">{target.context}</p>}
      {generating && <p role="status">正在生成场景建议…</p>}
      {!signedIn && <p className="muted">登录后可生成 AI 建议。也可以现在手动填写。</p>}
      {error && <p role="status">{error} {signedIn && <button className="redesign-text-button" onClick={() => setRevision(value => value + 1)}>重试 AI</button>}</p>}
      {options.map(label => <label className="scene-option" key={label}><input type="radio" name="usage-scene" checked={choice === label} onChange={() => { setChoice(label); setManual('') }} />{label}</label>)}
      <label className="field">自定义场景<input aria-label="自定义场景" value={manual} onChange={event => setManual(event.target.value)} maxLength={24} placeholder="例如：职场沟通" /></label>
      <div className="app-sheet-footer">
        <button className="chip" disabled={saving} onClick={() => target.scene ? void save('') : onClose()}>{target.scene ? '清除场景' : '取消'}</button>
        <button className="redesign-primary" disabled={!scene || saving} onClick={() => void save(scene)}>应用场景</button>
      </div>
    </section>}
  </MaterialSheet>
}
