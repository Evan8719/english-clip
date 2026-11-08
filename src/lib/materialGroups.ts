import type { MediaItem } from './media'

export function materialGroup(item: MediaItem): { purpose: string; series: string } {
  const text = `${item.title} ${item.source}`
  for (const [pattern, purpose, series] of [
    [/esl\s*pod/i, '慢速讲解', 'ESLPod'],
    [/life[\s_-]*kit/i, '生活实用', 'Life Kit'],
    [/planet[\s_-]*money/i, '叙事逻辑', 'Planet Money'],
    [/indicator/i, '短篇观点', 'The Indicator'],
    [/the[\s_-]*daily/i, '新闻叙事', 'The Daily'],
    [/how[\s_-]*i[\s_-]*built[\s_-]*this/i, '长访谈', 'How I Built This'],
  ] as const) if (pattern.test(text)) return { purpose, series }
  if (item.courseId) return { purpose: '系列课程', series: item.courseId === 'family-album' ? '走遍美国' : item.source || item.courseId }
  if (item.kind === 'book') return { purpose: '电子书', series: item.author || '其他作者' }
  if (item.kind === 'text') return { purpose: '短文阅读', series: item.source || '其他短文' }
  if (item.kind === 'lesson') return { purpose: '精选视频', series: item.source || '其他精选' }
  if (item.kind === 'link') return { purpose: '个人收集', series: item.source || '其他链接' }
  return { purpose: item.kind === 'video' ? '视频听力' : '日常听力', series: item.source || '其他听力' }
}
