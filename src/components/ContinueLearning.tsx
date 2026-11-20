import { SourceVisual } from './SourceVisual'
import { useEffect, useState } from 'react'
import { recentLearning, resolveLearning, type LearningRecord } from '../lib/learningProgress'
import { NavIcon } from './NavIcon'

export function ContinueLearning({ onOpen }: { onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<LearningRecord[]>([])
  useEffect(() => { let live = true; const update = () => { void recentLearning().then(value => { if (live) setItems(value) }).catch(() => undefined) }; update(); window.addEventListener('ec-learning-progress', update); return () => { live = false; window.removeEventListener('ec-learning-progress', update) } }, [])
  if (!items.length) return null
  return <section className="continue-learning" aria-label="继续学习">
    {(expanded ? items : items.slice(0, 1)).map(item => {
      const reading = item.kind === 'book'
      const action = reading ? '继续阅读' : item.kind === 'video' || item.kind === 'lesson' ? '继续观看' : '继续收听'
      const seconds = Math.floor(item.position.playbackPosition || 0)
      const position = item.position.readingPosition
      return <div key={item.id} className="continue-row">
        <button className="continue-open" onClick={() => onOpen(item.id)}>
          <SourceVisual materialId={item.id} source={item.title} category={reading ? '阅读' : '播客'} />
          <span className="continue-copy">
            <small className="continue-label">{action}</small>
            <strong>{item.title}</strong>
            <small>{position ? '第 ' + (position.chapter + 1) + ' 章 · 第 ' + (position.paragraph + 1) + ' 段' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')}{item.conflict ? ' · 位置有冲突' : item.pending ? ' · 等待同步' : ''}</small>
          </span>
          <span className="continue-action"><NavIcon name={reading ? 'next' : 'play'} /></span>
        </button>
        {item.conflict && <div className="continue-conflict">
          <p>另一设备更新了位置，请选择要保留的进度。</p>
          <button className="chip" onClick={() => void resolveLearning(item.id, true)}>保留本机位置</button>
          <button className="chip" onClick={() => void resolveLearning(item.id, false)}>采用 NAS 位置</button>
        </div>}
      </div>
    })}
    {items.length > 1 && <button className="continue-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起最近学习' : '其他最近学习'}</button>}
  </section>
}
