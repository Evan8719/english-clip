import { request as httpRequest } from 'node:http'
import { request as httpsRequest, Agent } from 'node:https'
import { connect as tlsConnect } from 'node:tls'
import { Readable } from 'node:stream'

// Use the configured HTTP CONNECT proxy; API credentials remain inside verified TLS.
export function proxyFetch(target, init, { proxyUrl, lookup, pinTarget = false, ca }) {
  const url = new URL(target), proxy = new URL(proxyUrl)
  if (!['http:', 'https:'].includes(proxy.protocol)) throw Error('NAS 代理须为 HTTP 或 HTTPS CONNECT 代理')
  if (proxy.pathname !== '/' || proxy.search || proxy.hash) throw Error('NAS 代理地址不能带路径或查询参数')
  const agent = new Agent({ keepAlive: false })
  agent.createConnection = (_options, callback) => {
    let tunnel, secure, settled = false, connectRequest
    function finish(error, socket) {
      if (settled) return
      settled = true
      if (error) { tunnel?.destroy(); secure?.destroy() }
      callback(error, socket)
    }
    function open(address) {
      const authority = `${address.includes(':') ? '[' + address + ']' : address}:${url.port || 443}`
      const headers = { Host: authority }
      if (proxy.username || proxy.password) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64')
      connectRequest = (proxy.protocol === 'https:' ? httpsRequest : httpRequest)(proxy, { method: 'CONNECT', path: authority, headers, signal: init.signal }, response => { response.resume(); finish(Object.assign(Error('NAS 代理拒绝建立连接'), { code: 'EC_PROXY_CONNECT' })) })
      connectRequest.on('connect', (response, socket, head) => {
        tunnel = socket
        if (response.statusCode !== 200) { finish(Object.assign(Error('NAS 代理拒绝建立连接'), { code: 'EC_PROXY_CONNECT' })); return }
        if (head.length) socket.unshift(head)
        secure = tlsConnect({ socket, servername: url.hostname, ...(ca ? { ca } : {}), rejectUnauthorized: true }, () => finish(null, secure))
        secure.once('error', error => finish(error))
      })
      connectRequest.on('error', error => finish(error)); connectRequest.end()
    }
    if (pinTarget) lookup(url.hostname, {}, (error, address) => error ? finish(error) : open(address))
    else open(url.hostname)
    const abort = () => { const error = Object.assign(Error('AI connection aborted'), { name: 'AbortError' }); connectRequest?.destroy(error); tunnel?.destroy(error); secure?.destroy(error); finish(error) }
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) abort()
    return undefined
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { agent, method: init.method, headers: init.headers, signal: init.signal }, response => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      response.once('end', () => agent.destroy()); response.once('error', () => agent.destroy())
      resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers }))
    })
    req.on('error', error => { agent.destroy(); reject(error) }); req.end(init.body)
  })
}

export function connectionMode(config) {
  const available = Boolean(process.env.EC_AI_PROXY_URL)
  const providers = (process.env.EC_AI_PROXY_PROVIDERS || 'gemini').split(',').map(value => value.trim())
  const useProxy = config.networkMode === 'proxy' || (config.networkMode !== 'direct' && available && providers.includes(config.provider))
  return { available, useProxy, label: process.env.EC_AI_PROXY_LABEL || 'NAS 出网代理' }
}

export function aiNetworkError(error) {
  const code = error.cause?.code || error.code || ''
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return Object.assign(Error('NAS 连接 AI 服务超时，请检查 NAS 出网连接或代理；电脑代理不会自动应用到 NAS'), { status: 502 })
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return Object.assign(Error('NAS 无法解析 AI 接口或代理域名，请检查地址和 DNS'), { status: 502 })
  if (code === 'ECONNREFUSED') return Object.assign(Error('连接被拒绝，请确认代理电脑和专用桥接仍在运行'), { status: 502 })
  if (code === 'EC_PROXY_CONNECT') return Object.assign(Error('NAS 代理拒绝连接，请核对代理权限及允许的服务域名'), { status: 502 })
  if (/CERT|TLS|SSL/.test(code)) return Object.assign(Error('AI 接口 TLS 证书校验失败，请检查地址和出网代理'), { status: 502 })
  if (error.message === 'fetch failed') return Object.assign(Error('NAS 无法连接 AI 服务，请检查 NAS 出网连接或代理'), { status: 502 })
  return error
}
