import { readFileSync, writeFileSync } from 'node:fs'

// Small renderer for the repository-owned guide subset; no user HTML is accepted.
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inline = value => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|candidates\.html)\)/g, '<a href="$2">$1</a>')
for (const [source, target, title] of [
  ['docs/USER_GUIDE.md', 'public/guide.html', '使用说明'],
  ['docs/content/CANDIDATES.md', 'public/candidates.html', '精选视频待选清单'],
]) {
  const body = readFileSync(source, 'utf8').split(/\r?\n/).map(line => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`
    if (!line.trim()) return ''
    if (/^[-\d]/.test(line) && /^(?:- |\d+\. )/.test(line)) return `<p class="step">${inline(line.replace(/^- /, '• '))}</p>`
    return `<p>${inline(line)}</p>`
  }).join('\n')
  writeFileSync(target, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 英语剪贴本</title><style>body{margin:0;background:#f4f5f8;color:#232b3b;font-family:system-ui,'Microsoft YaHei',sans-serif;font-size:16px;line-height:1.85}main{max-width:760px;margin:auto;padding:24px 24px 80px}nav{display:flex;flex-wrap:wrap;gap:20px;font-size:14px}a{color:#2855b0;text-underline-offset:4px}h1{font-size:28px;line-height:1.35;margin:36px 0 22px}h2{font-size:21px;line-height:1.5;margin:38px 0 12px}h3{font-size:18px;margin:28px 0 10px}p{margin:12px 0}.step{padding-left:1em;text-indent:-1em}a:focus-visible{outline:2px solid #2855ed;outline-offset:3px}::selection{background:#dce8dc}</style></head><body><main><nav><a href="/">英语剪贴本</a><a href="guide.html">使用说明</a><a href="candidates.html">待选清单</a></nav>${body}</main></body></html>\n`)
  console.log(target)
}
