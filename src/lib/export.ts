import { listEntries } from '../db/entries'
import { frequencyLabel } from './lexicon'
import { nowIso } from './normalize'
import type { Entry, EntryKind, Familiarity } from '../types'

const KIND_LABEL: Record<EntryKind, string> = {
  word: '单词',
  phrase: '短语',
  sentence: '句子',
}

const FAM_LABEL: Record<Familiarity, string> = {
  new: '生疏',
  seen: '见过',
  usable: '能用',
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function isAppleMobile() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

async function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const file = new File([blob], filename, { type: mime })
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }

  // iPhone/iPad PWA: <a download> often does nothing — prefer share sheet.
  if (isAppleMobile() && typeof nav.share === 'function') {
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename })
        return
      }
    } catch (err) {
      // User cancelled share — don't fall through to a broken download.
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()

  // Fallback for environments that ignore download attr: open content view.
  if (isAppleMobile()) {
    window.setTimeout(() => {
      const opened = window.open(url, '_blank')
      if (!opened) {
        void navigator.clipboard?.writeText(content)
      }
    }, 300)
  } else {
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
}

function formatEntryMarkdown(entry: Entry, index: number): string {
  const lines: string[] = []
  lines.push(`## ${index}. ${entry.text}`)
  lines.push('')

  const meta: string[] = [
    KIND_LABEL[entry.kind],
    FAM_LABEL[entry.familiarity],
    entry.category || '其他',
  ]
  if (entry.enrichment?.phonetic) meta.push(entry.enrichment.phonetic)
  if (entry.enrichment?.frequencyBand) {
    meta.push(frequencyLabel(entry.enrichment.frequencyBand))
  }
  if (entry.enrichment?.cefrBand) meta.push(`CEFR ${entry.enrichment.cefrBand}`)
  if (entry.enrichment?.pos) meta.push(entry.enrichment.pos)
  lines.push(meta.join(' · '))
  lines.push('')

  if (entry.enrichment?.definitionsZh?.length) {
    lines.push('**中文**')
    for (const def of entry.enrichment.definitionsZh) {
      lines.push(`- ${def}`)
    }
    lines.push('')
  }

  if (entry.enrichment?.definitions?.length) {
    lines.push('**英文释义**')
    for (const def of entry.enrichment.definitions) {
      lines.push(`- ${def}`)
    }
    lines.push('')
  }

  if (entry.enrichment?.examples?.length) {
    lines.push('**例句**')
    for (const ex of entry.enrichment.examples) {
      lines.push(`- ${ex}`)
    }
    lines.push('')
  }

  if (entry.source || entry.sourceDetail) {
    const src = [entry.source, entry.sourceDetail].filter(Boolean).join(' · ')
    lines.push(`**来源：** ${src}`)
    lines.push('')
  }

  if (entry.mySentence) {
    lines.push('**我会说的话**')
    lines.push(entry.mySentence)
    lines.push('')
  }

  if (entry.context) {
    lines.push('**语境**')
    lines.push(`> ${entry.context}`)
    lines.push('')
  }

  if (entry.note) {
    lines.push('**我的理解**')
    lines.push(entry.note)
    lines.push('')
  }

  if (entry.tags?.length) {
    lines.push(`**标签：** ${entry.tags.join(', ')}`)
    lines.push('')
  }

  lines.push(`_收录于 ${new Date(entry.createdAt).toLocaleString('zh-CN')}_`)
  lines.push('')
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}

export function entriesToMarkdown(entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const header = [
    '# 英语剪贴本',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    `共 ${sorted.length} 条`,
    '',
    '---',
    '',
  ].join('\n')

  if (sorted.length === 0) {
    return `${header}\n（暂无条目）\n`
  }

  return header + sorted.map((entry, i) => formatEntryMarkdown(entry, i + 1)).join('\n')
}

export async function exportEntriesJson(): Promise<void> {
  const entries = await listEntries()
  const payload = {
    exportedAt: nowIso(),
    version: 1,
    entries,
  }
  await downloadText(
    `english-clip-${dateStamp()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  )
}

export async function exportEntriesMarkdown(): Promise<void> {
  const entries = await listEntries()
  await downloadText(
    `english-clip-${dateStamp()}.md`,
    entriesToMarkdown(entries),
    'text/markdown;charset=utf-8',
  )
}
