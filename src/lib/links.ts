export function describeLink(value: string): { url: string; host: string; provider: string; videoId?: string; start: number } | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const videoId = host === 'youtu.be' ? url.pathname.split('/')[1] : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host) ? url.searchParams.get('v') || (/^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '') : ''
    const rawTime = url.searchParams.get('t') || url.searchParams.get('start') || '0'
    const groups = rawTime.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
    const start = Math.min(86400, /^\d+$/.test(rawTime) ? Number(rawTime) : groups ? Number(groups[1] || 0) * 3600 + Number(groups[2] || 0) * 60 + Number(groups[3] || 0) : 0)
    return { url: url.href, host, provider: /^(youtu\.be|youtube\.com|m\.youtube\.com|youtube-nocookie\.com)$/.test(host) ? 'YouTube' : host, videoId: videoId && /^[\w-]{11}$/.test(videoId) ? videoId : undefined, start }
  } catch { return null }
}
