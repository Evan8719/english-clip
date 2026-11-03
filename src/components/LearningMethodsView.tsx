import type { TabId } from '../types'

interface Method {
  id: string
  number: string
  category: string
  title: string
  idea: string
  steps: string[]
  action: string
  tab: TabId
  source: string
  sourceUrl: string
}

const methods: Method[] = [
  {
    id: 'capture', number: '01', category: '记录', title: '只记下你想再次用到的表达',
    idea: '把词和遇见它的原句放在一起。以后复习时，先回想当时要表达什么。',
    steps: ['从阅读、视频或对话中选一句真实遇到的英文。', '记录关键词句和出处；有想法时再补一条自己的例句。', '不必一次把释义填满，先留下以后能认出的线索。'],
    action: '记下一句', tab: 'home',
    source: '词汇在语境中的学习实验', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/36950639/',
  },
  {
    id: 'retrieve', number: '02', category: '复习', title: '先想一想，再翻卡看答案',
    idea: '看到英文先尝试说出意思和用法；想不起来再翻卡，并看一眼原句。',
    steps: ['只看卡片正面，停几秒主动回想。', '点击翻卡，对照释义和语境修正。', '在复习页按真实熟悉程度标记，不用追求全会。'],
    action: '去翻卡复习', tab: 'review',
    source: '词汇应用中的提取练习与反馈研究', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/34867656/',
  },
  {
    id: 'space', number: '03', category: '复习', title: '隔开几次，再见同一个词',
    idea: '把复习分散到不同日子，比一次反复看很多遍更适合长期记住。',
    steps: ['今天记录，稍后翻卡回想一次。', '过一两天再回到复习页。', '仍会用的词放轻，模糊的词继续留在眼前。'],
    action: '打开复习', tab: 'review',
    source: '外语词汇间隔练习实验', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/21702785/',
  },
  {
    id: 'listen', number: '04', category: '听力', title: '一小段素材，听出一句就够',
    idea: '选一段短音频，先听大意；需要时看原文，再回去听那一句。',
    steps: ['先完整听一遍，不暂停查每个词。', '找一处没听清的句子，对照原文再听。', '用 A/B 循环重听这一句，顺手收藏有用的表达。'],
    action: '挑一段素材', tab: 'materials',
    source: '听前阅读原文与二语听力研究', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/33271393/',
  },
  {
    id: 'speak', number: '05', category: '开口', title: '跟一句，再换成自己的话',
    idea: '从已经听懂的短句起步。先模仿节奏，再说一句与你有关的话。',
    steps: ['播放一句素材，跟读两遍。', '录下自己的版本，听一听是否能说清楚。', '换一个词或情境，自己说出新句子；需要时用 AI 对话接着练。'],
    action: '开始开口练', tab: 'practice',
    source: '英语学习者跟读与听说练习研究', sourceUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.836013/pdf',
  },
]

export function LearningMethodsView({ onNavigate, onCapture }: { onNavigate: (tab: TabId) => void; onCapture: () => void }) {
  return <div className="redesign-page methods-page">
    <header className="redesign-heading"><div><p className="redesign-eyebrow">A QUIET WAY TO LEARN</p><h1>学习方法</h1><p>不必做很多。选一个小方法，今天就试一次。</p></div></header>
    <div className="methods-intro"><span>从记录到开口</span><p>这些是可选的练习路径，不是任务清单。按你手边的时间和素材，挑最适合的一步。</p></div>
    <div className="methods-list">{methods.map((method) => <article className="method-card" key={method.id} id={`method-${method.id}`}>
      <div className="method-card-top"><span className="method-number">{method.number}</span><span className="redesign-tag">{method.category}</span></div>
      <h2>{method.title}</h2><p className="method-idea">{method.idea}</p>
      <ol>{method.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="method-card-foot"><button type="button" className="redesign-primary" onClick={() => method.id === 'capture' ? onCapture() : onNavigate(method.tab)}>{method.action} →</button><a href={method.sourceUrl} target="_blank" rel="noreferrer">阅读相关研究 ↗</a></div>
    </article>)}</div>
    <p className="methods-note">方法是学习建议，不保证每个人效果相同。研究链接供你按需阅读；离线时卡片内容仍可查看。</p>
  </div>
}
