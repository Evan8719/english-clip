import { NavIcon } from './NavIcon'
import { saveLearning } from '../lib/learningProgress'
import { useEffect, useRef, useState } from 'react'
import { patchMedia, type MediaItem } from '../lib/media'
import { getLemma } from '../lib/lexicon'
import { lookupZhGloss } from '../lib/zhGloss'
import { cacheMaterial, LEVELS } from '../lib/books'
import { StoryCover } from './StoryCover'

interface CaptureSeed { text: string; context?: string; category?: string; source?: string; sourceDetail?: string; origin?: { materialId: string; chapter?: number; paragraph?: number; courseId?: string; episode?: number; timestamp?: number } }
export function BookReader({ item, onBack, onCapture, onPractice, onSettings }: { onSettings: () => void; item: MediaItem; onBack: () => void; onCapture: (seed: CaptureSeed) => void; onPractice: (text: string, title: string) => void }) {
  const chapters = item.chapters || []
  const [chapter, setChapter] = useState(Math.min(item.readingPosition?.chapter ?? (/gutenberg/i.test(chapters[0]?.title || '') && chapters.length > 1 ? 1 : 0), Math.max(0, chapters.length - 1)))
  const [paragraph, setParagraph] = useState(item.readingPosition?.paragraph || 0)
  const [selected, setSelected] = useState('')
  const [selectionParagraph, setSelectionParagraph] = useState(0)
  const [definition, setDefinition] = useState('')
  const [size, setSize] = useState(() => Math.max(16, Math.min(28, Number(localStorage.getItem('ec.reader-size')) || 19)))
  const [immersive, setImmersive] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('ec.reader-theme') || 'auto')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState(item.level || '')
  const content = useRef<HTMLElement>(null)
  const readingPane = useRef<HTMLDivElement>(null)
  const current = chapters[chapter]
  const lookupSequence = useRef(0)
  function invalidateLookup() { lookupSequence.current++ }
  function closeSelection() {
    invalidateLookup()
    setSelected(''); setDefinition('')
    window.getSelection()?.removeAllRanges()
  }
  useEffect(() => {
    void saveLearning(item, { readingPosition: { chapter, paragraph } }).catch(() => setStatus('学习位置保存失败，请检查本机空间'))
  }, [chapter, paragraph, item])
  useEffect(() => { void cacheMaterial(item.id, { ...item, level }).catch(() => setStatus('本机空间不足，请检查存储空间')) }, [item, level])
  useEffect(() => { if (item.readingPosition) content.current?.querySelector(`[data-paragraph="${item.readingPosition.paragraph || 0}"]`)?.scrollIntoView({ block: 'center' }) }, [item])
  useEffect(() => { localStorage.setItem('ec.reader-size', String(size)); localStorage.setItem('ec.reader-theme', theme) }, [size, theme])
  useEffect(() => {
    const pane = immersive ? readingPane.current : content.current?.closest('.redesign-workspace')
    if (!pane || !content.current) return
    let timer: number | undefined
    const update = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const top = pane.getBoundingClientRect().top + 85
        const paragraphs = [...(content.current?.querySelectorAll<HTMLElement>('[data-paragraph]') || [])]
        const currentParagraph = paragraphs.find((node) => node.getBoundingClientRect().bottom > top)
        if (currentParagraph && pane.clientHeight > 0) setParagraph(Number(currentParagraph.dataset.paragraph))
      }, 180)
    }
    pane.addEventListener('scroll', update, { passive: true })
    return () => { pane.removeEventListener('scroll', update); window.clearTimeout(timer) }
  }, [chapter, immersive])
  useEffect(() => {
    if (!immersive) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setImmersive(false) }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [immersive])
  function toggleImmersive() {
    closeSelection()
    setImmersive((value) => !value)
    window.requestAnimationFrame(() => content.current?.querySelector(`[data-paragraph="${paragraph}"]`)?.scrollIntoView({ block: 'start' }))
  }
  function changeChapter(next: number) {
    closeSelection(); setChapter(next); setParagraph(0)
    window.requestAnimationFrame(() => content.current?.scrollIntoView({ block: 'start' }))
  }
  async function pick() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount || !content.current?.contains(selection.anchorNode) || !content.current.contains(selection.focusNode)) return
    const text = selection.toString().trim()
    const start = selection.getRangeAt(0).startContainer
    const element = start instanceof Element ? start : start.parentElement
    const index = Number(element?.closest('[data-paragraph]')?.getAttribute('data-paragraph'))
    if (!text || !element?.closest('[data-paragraph]') || !Number.isInteger(index)) return
    setParagraph(index); setSelectionParagraph(index); setSelected(text); setDefinition('')
    const sequence = ++lookupSequence.current
    if (text && text.split(/\s+/).length <= 4) {
      const normalized = text.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '')
      try {
        const [lemma, zh] = await Promise.all([getLemma(normalized), lookupZhGloss(normalized)])
        if (sequence === lookupSequence.current) setDefinition(zh || lemma?.definitions.join('；') || '本地词典暂未收录，可直接记录你的理解。')
      } catch { if (sequence === lookupSequence.current) setDefinition('词典暂未加载，可先记录，联网后再查词。') }
    }
  }
  useEffect(() => {
    let timer: number | undefined
    const onSelectionChange = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void pick(), 150) }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => { document.removeEventListener('selectionchange', onSelectionChange); window.clearTimeout(timer); invalidateLookup() }
  }, [chapter])
  const context = current?.paragraphs[selectionParagraph] || ''
  return <div className={`book-reader reader-theme-${theme}${immersive ? ' is-immersive' : ''}`}>
    <header className="reader-toolbar"><button type="button" onClick={onBack}>← 素材库</button><span>{item.title}</span>{immersive && <button className="icon-action" aria-label="阅读页全局设置" onClick={onSettings}><NavIcon name="settings" /></button>}<button type="button" aria-pressed={immersive} onClick={toggleImmersive}>{immersive ? '退出沉浸' : '沉浸阅读'}</button><details className="reader-settings"><summary aria-label="阅读设置">Aa</summary><div><label>字号 <button aria-label="缩小字号" onClick={() => setSize(Math.max(16, size - 1))}>A−</button><span>{size}</span><button aria-label="放大字号" onClick={() => setSize(Math.min(28, size + 1))}>A＋</button></label><label>背景 <select aria-label="阅读背景" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="auto">跟随全局外观</option><option value="paper">暖纸</option><option value="white">明亮</option><option value="night">夜间</option></select></label><label>章节 <select aria-label="沉浸阅读章节" value={chapter} onChange={(event) => changeChapter(Number(event.target.value))}>{chapters.map((part, index) => <option key={index} value={index}>{part.title}</option>)}</select></label></div></details></header>
    <div className="reader-location"><span>第 {chapter + 1} / {chapters.length} 章</span><progress className="learning-progress" value={paragraph + 1} max={current?.paragraphs.length || 1} aria-label="本章阅读位置" /></div>
    <div className="reader-layout" ref={readingPane}><aside className="reader-contents"><StoryCover title={item.title} author={item.author} coverUrl={item.coverUrl} /><h2>目录</h2><select aria-label="选择章节" value={chapter} onChange={(event) => changeChapter(Number(event.target.value))}>{chapters.map((part, index) => <option key={index} value={index}>{part.title}</option>)}</select><p>{item.author || '原著阅读'} · 参考等级 <select aria-label="阅读难度" value={level} onChange={(e) => { const value = e.target.value; setLevel(value); void patchMedia(item.id, { level: value }).catch(() => setStatus('当前离线，等级仅保存在本机')) }}><option value="">待评估</option>{LEVELS.map((value) => <option key={value}>{value}</option>)}</select></p><p>拖选文字，或长按选词后，可查词、记录和复述。</p></aside>
      <article ref={content} className="reader-text" style={{ fontSize: size }} onMouseUp={() => void pick()}><h1>{current?.title || item.title}</h1>{current?.paragraphs.map((text, index) => <p key={index} data-paragraph={index} className={selected && selectionParagraph === index ? 'reader-paragraph selected' : 'reader-paragraph'}>{text}</p>)}<div className="reader-chapter-nav"><button disabled={chapter === 0} onClick={() => changeChapter(chapter - 1)}>上一章</button><span>{chapter + 1} / {chapters.length}</span><button disabled={chapter >= chapters.length - 1} onClick={() => changeChapter(chapter + 1)}>下一章</button></div></article>
    </div>
    {selected && <section className="reader-selection" aria-label="阅读选文"><div><strong>{selected.length > 160 ? `${selected.slice(0, 160)}…` : selected}</strong>{definition && <p>{definition}</p>}</div><div className="reader-selection-actions"><button className="redesign-primary" onClick={() => onCapture({ text: selected.slice(0, 2000), context, category: '阅读', source: item.title, origin: { materialId: item.id, chapter, paragraph: selectionParagraph }, sourceDetail: `${current.title} · 段落 ${selectionParagraph + 1}` })}>记进本子</button><button className="redesign-secondary" onClick={() => onPractice(selected, `${item.title} · ${current.title}`)}>开口复述</button><button aria-label="关闭选文" onClick={closeSelection}>×</button></div></section>}
    {status && <p className="redesign-message">{status}</p>}
  </div>
}
