const lessons = [
  '摄影与相机',
  '喜欢的地方',
  '周末出行',
  '阅读习惯',
  '音乐喜好',
  '驾驶经历',
  '天气与季节',
  '一道食物',
]

const contentBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
)
const starterPackUrl = `${contentBase || ''}/practice/starter-20261026/index.html`

export function MaterialsView() {
  return (
    <div className="page">
      <header className="page-header">
        <p className="brand-mark">Listen &amp; Speak</p>
        <h1>听说素材</h1>
        <p className="lede">短一点，反复听。跟读熟了，再试着用自己的话说。</p>
      </header>

      <section className="panel material-pack">
        <div className="material-pack__cover">
          <p className="muted tiny">第一批 · ELLLO 日常对话</p>
          <h2>日常表达与兴趣话题</h2>
        </div>
        <p>
          8 段自然短对话，共约 9 分钟。每段都配完整原文、练习表达和复述提示。
        </p>
        <div className="material-pack__meta">
          <span className="chip">High Beginner</span>
          <span className="chip">可调速</span>
          <span className="chip">A/B 循环</span>
          <span className="chip">原文对照</span>
        </div>
        <div className="material-pack__topics" aria-label="本批素材话题">
          {lessons.map((lesson) => (
            <span className="fam" key={lesson}>
              {lesson}
            </span>
          ))}
        </div>
        <p className="muted tiny">
          原课没有逐句时间轴，所以这里保留真实原文，并用手动 A/B 循环帮助精听。
        </p>
        <a className="primary material-pack__action" href={starterPackUrl}>
          开始练习
        </a>
      </section>

      <p className="muted tiny">
        素材来自 ELLLO，保留原课来源，用于教育学习与非商业使用。
      </p>
    </div>
  )
}
