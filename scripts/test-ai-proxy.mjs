import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { createServer as tlsServer } from 'node:https'
import { connect } from 'node:net'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { proxyFetch } from '../nas/ai-network.mjs'
import { startPcProxy } from './pc-ai-proxy.mjs'

const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done))
const close = server => new Promise(done => server.close(done))
const plain = httpServer()
plain.on('connect', (req, socket) => { socket.end('HTTP/1.1 200 Connection Established\r\n\r\n'); socket.on('error', () => {}) })
await listen(plain)
const bridge = startPcProxy({ bind: '127.0.0.1', port: 0, nasAddress: '127.0.0.1', proxyPort: plain.address().port, allowedHosts: ['generativelanguage.googleapis.com'] })
await once(bridge.server, 'listening')
async function probe(line, port = bridge.server.address().port, allowReset = false) {
  return new Promise((done, reject) => { const socket = connect(port, '127.0.0.1'); let value = ''; socket.setTimeout(1500, () => socket.destroy(Error('test timeout'))); socket.once('connect', () => socket.write(line)); socket.on('data', chunk => { value += chunk; if (value.includes('\r\n\r\n')) socket.destroy() }); socket.on('close', () => done(value)); socket.on('error', error => allowReset && error.code === 'ECONNRESET' ? done(value) : reject(error)) })
}
assert.match(await probe('CONNECT generativelanguage.googleapis.com:443 HTTP/1.1\r\nHost: generativelanguage.googleapis.com:443\r\n\r\n'), /200/)
assert.match(await probe('CONNECT unapproved.example.test:443 HTTP/1.1\r\n\r\n'), /403/)
assert.match(await probe('GET http://example.test/ HTTP/1.1\r\n\r\n'), /403/)
await new Promise(done => { bridge.server.once('close', done); bridge.close() }); await close(plain)
const denied = startPcProxy({ bind: '127.0.0.1', port: 0, nasAddress: '127.0.0.2', proxyPort: 1, allowedHosts: ['generativelanguage.googleapis.com'] })
await once(denied.server, 'listening')
assert.equal(await probe('CONNECT generativelanguage.googleapis.com:443 HTTP/1.1\r\n\r\n', denied.server.address().port, true), '')
await new Promise(done => { denied.server.once('close', done); denied.close() })
let openssl = true
try { execFileSync(process.env.EC_TEST_OPENSSL || 'openssl', ['version'], { stdio: 'ignore' }) } catch { openssl = false }
if (openssl) {
  const dir = resolve(`work/proxy-tls-test-${process.pid}`); mkdirSync(dir, { recursive: true })
  const key = join(dir, 'synthetic.key'), cert = join(dir, 'synthetic.crt')
  execFileSync(process.env.EC_TEST_OPENSSL || 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-days', '1'], { stdio: 'ignore' })
  const origin = tlsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => { assert.equal(req.headers.authorization, 'Bearer synthetic-only'); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}') })
  origin.on('tlsClientError', () => {}); await listen(origin)
  const tunnels = new Set(), proxy = httpServer()
  proxy.on('connect', (req, socket, head) => { assert.equal(req.headers.authorization, undefined); assert.equal(req.url, `localhost:${origin.address().port}`); const upstream = connect(origin.address().port, '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket) }); tunnels.add(socket); socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy()); socket.once('close', () => { tunnels.delete(socket); upstream.destroy() }) })
  await listen(proxy)
  const url = `https://localhost:${origin.address().port}/`, settings = { proxyUrl: `http://127.0.0.1:${proxy.address().port}`, ca: readFileSync(cert) }
  const init = { method: 'GET', headers: { Authorization: 'Bearer synthetic-only' }, signal: AbortSignal.timeout(5000) }
  assert.deepEqual(await (await proxyFetch(url, init, settings)).json(), { ok: true })
  await assert.rejects(proxyFetch(url, { ...init, signal: AbortSignal.timeout(5000) }, { ...settings, ca: undefined }), /certificate|self.signed/i)
  for (const socket of tunnels) socket.destroy(); await close(proxy); await close(origin)
}
console.log(JSON.stringify({ ok: true, nasSourceRestriction: true, hostAllowlist: true, connectOnly: true, tlsEndToEndAndVerification: openssl, tlsSkippedReason: openssl ? null : 'OpenSSL unavailable on this host', externalRequests: false }))
