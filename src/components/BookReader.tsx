import { useEffect, useRef, useState } from 'react'
import { patchMedia, type MediaItem } from '../lib/media'
import { getLemma } from '../lib/lexicon'
import { lookupZhGloss } from '../lib/zhGloss'
import { cacheMaterial, LEVELS } from '../lib/books'

interface CaptureSeed { text: string; context?: string; category?: string; source?: string; sourceDetail?: string; origin?: { materialId: string; chapter?: number; paragraph?: number; courseId?: string; episode?: number; timestamp?: number } }
export function BookReader({ item, onBack, onCapture, onPractice }: { item: MediaItem; onBack: () => void; onCapture: (seed: CaptureSeed) => void; onPractice: (text: string, title: string) => void }) {
  const chapters = item.chapters || []
  const [chapter, setChapter] = useState(Math.min(item.readingPosition?.chapter ?? (/gutenberg/i.test(chapters[0]?.title || '') && chapters.length > 1 ? 1 : 0), Math.max(0, chapters.length - 1)))
  const [paragraph, setParagraph] = useState(item.readingPosition?.paragraph || 0)
  const [selected, setSelected] = useState('')
  const [definition, setDefinition] = useState('')
  const [size, setSize] = useState(19)
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState(item.level || '')
  const content = useRef<HTMLElement>(null)
  const current = chapters[chapter]
  const lookupSequence = useRef(0)
  function invalidateLookup() { lookupSequence.current++ }
  function closeSelection() {
    invalidateLookup()
    setSelected(''); setDefinition('')
    window.getSelection()?.removeAllRanges()
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = { ...item, level, readingPosition: { chapter, paragraph } }
      void cacheMaterial(item.id, next)
      void patchMedia(item.id, { readingPosition: next.readingPosition }).catch(() => setStatus('阅读位置已保存在本机；联网后继续阅读时会同步。'))
    }, 800)
    return () => window.clearTimeout(timer)
  }, [chapter, paragraph, item, level])
  useEffect(() => { if (item.readingPosition) content.current?.querySelector(`[data-paragraph="${item.readingPosition.paragraph || 0}"]`)?.scrollIntoView({ block: 'center' }) }, [item])
  async function pick() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount || !content.current?.contains(selection.anchorNode) || !content.current.contains(selection.focusNode)) return
    const text = selection.toString().trim()
    const start = selection.getRangeAt(0).startContainer
    const element = start instanceof Element ? start : start.parentElement
    const index = Number(element?.closest('[data-paragraph]')?.getAttribute('data-paragraph'))
    if (!text || !element?.closest('[data-paragraph]') || !Number.isInteger(index)) return
    setParagraph(index); setSelected(text); setDefinition('')
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
  const context = current?.paragraphs[paragraph] || ''
  return <div className="book-reader">
    <header className="reader-toolbar"><button type="button" onClick={onBack}>← 素材库</button><span>{item.title}</span><div><button aria-label="缩小字号" onClick={() => setSize(Math.max(16, size - 1))}>A−</button><button aria-label="放大字号" onClick={() => setSize(Math.min(28, size + 1))}>A＋</button></div></header>
    <div className="reader-layout"><aside className="reader-contents"><h2>目录</h2><select aria-label="选择章节" value={chapter} onChange={(event) => { closeSelection(); setChapter(Number(event.target.value)); setParagraph(0) }}>{chapters.map((part, index) => <option key={index} value={index}>{part.title}</option>)}</select><p>{item.author || '原著阅读'} · 参考等级 <select aria-label="阅读难度" value={level} onChange={(e) => { const value = e.target.value; setLevel(value); void patchMedia(item.id, { level: value }).catch(() => setStatus('当前离线，等级仅保存在本机')) }}><option value="">待评估</option>{LEVELS.map((value) => <option key={value}>{value}</option>)}</select></p><p>拖选文字，或长按选词后，可查词、记录和复述。</p></aside>
      <article ref={content} className="reader-text" style={{ fontSize: size }} onMouseUp={() => void pick()}><h1>{current?.title || item.title}</h1>{current?.paragraphs.map((text, index) => <p key={index} data-paragraph={index} className={selected && paragraph === index ? 'reader-paragraph selected' : 'reader-paragraph'}>{text}</p>)}<div className="reader-chapter-nav"><button disabled={chapter === 0} onClick={() => { closeSelection(); setChapter(chapter - 1); setParagraph(0) }}>上一章</button><span>{chapter + 1} / {chapters.length}</span><button disabled={chapter >= chapters.length - 1} onClick={() => { closeSelection(); setChapter(chapter + 1); setParagraph(0) }}>下一章</button></div></article>
    </div>
    {selected && <section className="reader-selection" aria-label="阅读选文"><div><strong>{selected.length > 160 ? `${selected.slice(0, 160)}…` : selected}</strong>{definition && <p>{definition}</p>}</div><div className="reader-selection-actions"><button className="redesign-primary" onClick={() => onCapture({ text: selected.slice(0, 2000), context, category: '阅读', source: item.title, origin: { materialId: item.id, chapter, paragraph }, sourceDetail: `${current.title} · 段落 ${paragraph + 1}` })}>记进本子</button><button className="redesign-secondary" onClick={() => onPractice(selected, `${item.title} · ${current.title}`)}>开口复述</button><button aria-label="关闭选文" onClick={closeSelection}>×</button></div></section>}
    {status && <p className="redesign-message">{status}</p>}
  </div>
}
