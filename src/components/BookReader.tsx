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
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = { ...item, level, readingPosition: { chapter, paragraph } }
      void cacheMaterial(item.id, next)
      void patchMedia(item.id, { readingPosition: next.readingPosition }).catch(() => setStatus('阅读位置已保存在本机；联网后继续阅读时会同步。'))
    }, 800)
    return () => window.clearTimeout(timer)
  }, [chapter, paragraph, item, level])
  useEffect(() => { if (item.readingPosition) content.current?.querySelector(`[data-paragraph="${item.readingPosition.paragraph || 0}"]`)?.scrollIntoView({ block: 'center' }) }, [item])
  async function pick(index: number) {
    const selection = window.getSelection()
    const text = selection && content.current?.contains(selection.anchorNode) && content.current?.contains(selection.focusNode) ? selection.toString().trim() : ''
    setParagraph(index); setSelected(text || current.paragraphs[index]); setDefinition('')
    const sequence = ++lookupSequence.current
    if (text && text.split(/\s+/).length <= 4) {
      const normalized = text.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '')
      try {
        const [lemma, zh] = await Promise.all([getLemma(normalized), lookupZhGloss(normalized)])
        if (sequence === lookupSequence.current) setDefinition(zh || lemma?.definitions.join('；') || '本地词典暂未收录，可直接记录你的理解。')
      } catch { if (sequence === lookupSequence.current) setDefinition('词典暂未加载，可先记录，联网后再查词。') }
    }
  }
  const context = current?.paragraphs[paragraph] || ''
  return <div className="book-reader">
    <header className="reader-toolbar"><button type="button" onClick={onBack}>← 素材库</button><span>{item.title}</span><div><button aria-label="缩小字号" onClick={() => setSize(Math.max(16, size - 1))}>A−</button><button aria-label="放大字号" onClick={() => setSize(Math.min(28, size + 1))}>A＋</button></div></header>
    <div className="reader-layout"><aside className="reader-contents"><h2>目录</h2><select aria-label="选择章节" value={chapter} onChange={(event) => { setChapter(Number(event.target.value)); setParagraph(0); setSelected('') }}>{chapters.map((part, index) => <option key={index} value={index}>{part.title}</option>)}</select><p>{item.author || '原著阅读'} · 参考等级 <select aria-label="阅读难度" value={level} onChange={(e) => { const value = e.target.value; setLevel(value); void patchMedia(item.id, { level: value }).catch(() => setStatus('当前离线，等级仅保存在本机')) }}><option value="">待评估</option>{LEVELS.map((value) => <option key={value}>{value}</option>)}</select></p><p>点一段，或长按选词，即可查词和记录。</p></aside>
      <article ref={content} className="reader-text" style={{ fontSize: size }}><h1>{current?.title || item.title}</h1>{current?.paragraphs.map((text, index) => <p key={index} data-paragraph={index} className={paragraph === index ? 'reader-paragraph selected' : 'reader-paragraph'} onMouseUp={() => void pick(index)} onTouchEnd={() => { window.setTimeout(() => void pick(index), 100) }} onClick={() => { if (!window.getSelection()?.toString()) void pick(index) }}>{text}</p>)}<div className="reader-chapter-nav"><button disabled={chapter === 0} onClick={() => { setChapter(chapter - 1); setParagraph(0); setSelected('') }}>上一章</button><span>{chapter + 1} / {chapters.length}</span><button disabled={chapter >= chapters.length - 1} onClick={() => { setChapter(chapter + 1); setParagraph(0); setSelected('') }}>下一章</button></div></article>
    </div>
    {selected && <section className="reader-selection" aria-label="阅读选文"><div><strong>{selected.length > 160 ? `${selected.slice(0, 160)}…` : selected}</strong>{definition && <p>{definition}</p>}</div><div className="reader-selection-actions"><button className="redesign-primary" onClick={() => onCapture({ text: selected.slice(0, 2000), context, category: '阅读', source: item.title, origin: { materialId: item.id, chapter, paragraph }, sourceDetail: `${current.title} · 段落 ${paragraph + 1}` })}>记进本子</button><button className="redesign-secondary" onClick={() => onPractice(selected, `${item.title} · ${current.title}`)}>开口复述</button><button aria-label="关闭选文" onClick={() => setSelected('')}>×</button></div></section>}
    {status && <p className="redesign-message">{status}</p>}
  </div>
}
