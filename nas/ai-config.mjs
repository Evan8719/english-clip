import { request } from 'node:https'
import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { proxyFetch, connectionMode, aiNetworkError } from './ai-network.mjs'

export const AI_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', thinking: 'disabled', reasoningEffort: 'default', networkMode: 'auto' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', thinking: 'default', reasoningEffort: 'low', networkMode: 'auto' },
}
const invalid = message => Object.assign(Error(message), { status: 400 })

export function normalizeAiSettings(provider, input = {}) {
  if (!Object.hasOwn(AI_PRESETS, provider)) throw invalid('不支持的 AI 服务')
  const defaults = AI_PRESETS[provider]
  let url
  try { url = new URL(String(input.baseUrl ?? defaults.baseUrl).trim()) } catch { throw invalid('请输入完整的 HTTPS 接口地址') }
  // Custom connections are public HTTPS services, never an internal NAS proxy.
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan)$/.test(url.hostname)) throw invalid('接口地址须为公开 HTTPS 域名，不能包含账号、查询参数或内网地址')
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
  const baseUrl = url.toString().replace(/\/$/, '')
  const model = String(input.model ?? defaults.model).trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model)) throw invalid('请输入模型 ID，不能包含空格')
  const thinking = input.thinking ?? defaults.thinking, reasoningEffort = input.reasoningEffort ?? defaults.reasoningEffort
  if (!['default', 'disabled', 'enabled'].includes(thinking) || !['default', 'low', 'medium', 'high'].includes(reasoningEffort)) throw invalid('回复方式无效')
  const networkMode = input.networkMode ?? 'auto'
  if (!['auto', 'direct', 'proxy'].includes(networkMode)) throw invalid('连接方式无效')
  return { baseUrl, model, thinking, reasoningEffort, networkMode }
}

export function normalizeApiKey(value) {
  const key = String(value || '').trim()
  // Keys are opaque: Google auth keys and compatible gateways need not share a prefix or length.
  if (!key || key.length > 4096 || !/^[!-~]+$/.test(key) || /["'`]/.test(key)) throw invalid('请粘贴完整密钥，不要带引号、空格或换行')
  return key
}

export function publicAddress(address) {
  const ip = address.toLowerCase()
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19].includes(b)))
  }
  // Only global-unicast IPv6; mapped IPv4, local and multicast ranges are excluded.
  return isIP(ip) === 6 && /^[23]/.test(ip) && !ip.startsWith('2001:db8:')
}

export function publicLookup(hostname, options, callback, resolver = lookup) {
  resolver(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error)
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) return callback(Error('自定义接口不能连接内网或保留地址'))
    if (options.all) return callback(null, addresses)
    const selected = addresses.find(item => !options.family || item.family === options.family) || addresses[0]
    callback(null, selected.address, selected.family)
  })
}

function publicHttpsFetch(url, init) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method, headers: init.headers, signal: init.signal, lookup: publicLookup }, response => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers }))
    })
    req.on('error', reject)
    req.end(init.body)
  })
}

export function aiFetcher(config, fetcher = fetch) {
  return async (url, init) => {
    try {
      if (fetcher !== fetch) return await fetcher(url, init)
      const route = connectionMode(config)
      const standard = Object.values(AI_PRESETS).some(preset => config.baseUrl === preset.baseUrl)
      if (route.useProxy) {
        if (!route.available) throw Object.assign(Error('NAS 尚未配置出网代理；可选择直接连接，或先配置可用代理'), { status: 409 })
        return await proxyFetch(url, init, { proxyUrl: process.env.EC_AI_PROXY_URL, lookup: publicLookup, pinTarget: !standard })
      }
      return await (standard ? fetch : publicHttpsFetch)(url, init)
    } catch (error) { throw aiNetworkError(error) }
  }
}
