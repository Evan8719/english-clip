import { useEffect, useState } from 'react'
import { recentLearning, resolveLearning, type LearningRecord } from '../lib/learningProgress'
import { NavIcon } from './NavIcon'

export function ContinueLearning({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<LearningRecord[]>([])
  useEffect(() => { let live = true; const update = () => { void recentLearning().then(value => { if (live) setItems(value) }).catch(() => undefined) }; update(); window.addEventListener('ec-learning-progress', update); return () => { live = false; window.removeEventListener('ec-learning-progress', update) } }, [])
  if (!items.length) return null
  return <section className="continue-learning"><h2>继续学习</h2>{items.map(item => <div key={item.id} className="continue-row"><button className="continue-open" onClick={() => onOpen(item.id)}><NavIcon name={item.kind === 'book' ? 'book' : 'play'} /><span><strong>{item.title}</strong><small>{item.position.readingPosition ? `第 ${item.position.readingPosition.chapter + 1} 章 · 第 ${item.position.readingPosition.paragraph + 1} 段` : `${Math.floor((item.position.playbackPosition || 0) / 60)}:${String(Math.floor((item.position.playbackPosition || 0) % 60)).padStart(2,'0')}`} · {item.conflict ? '位置有冲突' : item.pending ? '本机已保存 · 等待同步' : '已同步'}</small></span></button>{item.conflict && <div className="continue-conflict"><p>另一设备更新了位置，请选择要保留的进度。</p><button className="chip" onClick={() => void resolveLearning(item.id, true)}>保留本机位置</button><button className="chip" onClick={() => void resolveLearning(item.id, false)}>采用 NAS 位置</button></div>}</div>)}</section>
}
