import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { explainExpression, streamConversation, testAssistant, providerHttpError, listAssistantModels } from '../nas/deepseek.mjs'
import { aiNetworkError, connectionMode } from '../nas/ai-network.mjs'
import { normalizeAiSettings, normalizeApiKey, publicAddress, publicLookup } from '../nas/ai-config.mjs'

for (const provider of ['deepseek', 'gemini']) {
  let request
  const explanation = await explainExpression({ apiKey: 'test-only', provider, body: { text: 'fine', context: 'I had to pay a parking fine.', source: 'A story' }, fetcher: async (url, init) => {
    request = { url, ...JSON.parse(init.body) }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ definitionsZh: ['罚款'], note: '在原句中是名词，并非“好的”。', uncertain: false }) } }] })
  } })
  assert.equal(explanation.definitionsZh[0], '罚款')
  assert.equal(explanation.provider, provider)
  assert.equal(JSON.parse(request.messages[1].content).context, 'I had to pay a parking fine.')
  assert.equal(request.response_format.type, 'json_object')
  assert.ok(request.url.startsWith(provider === 'gemini' ? 'https://generativelanguage.googleapis.com/' : 'https://api.deepseek.com/'))
  if (provider === 'gemini') { assert.equal(request.model, 'gemini-3.8-flash'); assert.equal(request.reasoning_effort, 'low'); assert.equal(request.thinking, undefined) }

  const response = new EventEmitter(), chunks = []
  Object.assign(response, { destroyed: false, writableEnded: false, writeHead() {}, flushHeaders() {}, write(value) { chunks.push(value) }, end() { this.writableEnded = true } })
  await streamConversation(null, response, { apiKey: 'test-only', provider, body: { message: 'Hello' }, fetcher: async () => new Response('data: {"choices":[{"delta":{"content":"Hello!"}}]}\n\ndata: [DONE]\n\n') })
  assert.ok(chunks.some(chunk => chunk.includes('Hello!')))
  assert.ok(chunks.at(-1).includes('"done":true'))
}
const unknown = await explainExpression({ apiKey: 'test-only', body: { text: 'unknown-new-word' }, fetcher: async () => Response.json({ choices: [{ message: { content: '{"definitionsZh":[],"note":"含义不确定，请补充原句。","uncertain":true}' } }] }) })
assert.equal(unknown.uncertain, true)
for (const content of ['not JSON', '{}', '{"definitionsZh":[42]}']) {
  await assert.rejects(explainExpression({ apiKey: 'test-only', body: { text: 'fine' }, fetcher: async () => Response.json({ choices: [{ message: { content } }] }) }), error => error.status === 502)
}
await assert.rejects(explainExpression({ apiKey: 'test-only', body: { text: 'fine' }, fetcher: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) }), /不完整/)
await assert.rejects(explainExpression({ apiKey: 'test-only', body: { text: 'fine' }, fetcher: async () => new Response('private upstream error', { status: 401 }) }), error => error.status === 502 && !error.message.includes('private upstream'))
await assert.rejects(explainExpression({ apiKey: 'test-only', body: { text: '' } }), error => error.status === 400)
const longAuthKey = 'AQ.TEST_ONLY_' + 'x'.repeat(600)
assert.equal(normalizeApiKey(longAuthKey), longAuthKey)
assert.equal(normalizeApiKey('gateway-credential'), 'gateway-credential')
for (const key of ['', 'some key', 'some\nkey', '"quoted-key"', 'x'.repeat(4097)]) assert.throws(() => normalizeApiKey(key), error => error.status === 400 && !error.message.includes(key || 'not-present'))
for (const baseUrl of ['http://example.test', 'https://user:pass@example.test', 'https://example.test?key=value', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://service.local']) assert.throws(() => normalizeAiSettings('gemini', { baseUrl }))
assert.throws(() => normalizeAiSettings('constructor', { baseUrl: 'https://api.example.test', model: 'custom', thinking: 'default', reasoningEffort: 'default' }))
const settings = normalizeAiSettings('gemini', { baseUrl: 'https://api.example.test/v1/chat/completions/', model: 'my/model-v2', reasoningEffort: 'default' })
assert.equal(settings.baseUrl, 'https://api.example.test/v1')
await testAssistant({ provider: 'gemini', apiKey: 'test-only', settings, fetcher: async (url, init) => {
  const body = JSON.parse(init.body)
  assert.equal(url, 'https://api.example.test/v1/chat/completions')
  assert.equal(body.model, 'my/model-v2')
  assert.equal(body.reasoning_effort, undefined)
  return Response.json({ choices: [{ message: { content: 'OK' } }] })
} })
await assert.rejects(testAssistant({ provider: 'gemini', apiKey: 'test-only', settings, fetcher: async () => new Response('private upstream body', { status: 404 }) }), /接口或模型不存在/)
for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.2', '192.168.1.2', '100.64.0.2', '198.18.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) assert.equal(publicAddress(address), false)
for (const address of ['8.8.8.8', '2607:f8b0:4005:80a::200e']) assert.equal(publicAddress(address), true)
await new Promise(resolve => publicLookup('api.example.test', {}, error => { assert.ok(error); resolve() }, (_host, _options, done) => done(null, [{ address: '127.0.0.1', family: 4 }])))
await new Promise(resolve => publicLookup('api.example.test', { all: true }, (error, addresses) => { assert.equal(error, null); assert.equal(addresses[0].address, '8.8.8.8'); resolve() }, (_host, _options, done) => done(null, [{ address: '8.8.8.8', family: 4 }])))
assert.match(aiNetworkError(new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })).message, /NAS.*超时/)
assert.match(aiNetworkError(Object.assign(Error('private details'), { code: 'ECONNREFUSED' })).message, /代理电脑/)
const beforeProxy = process.env.EC_AI_PROXY_URL
process.env.EC_AI_PROXY_URL = 'http://proxy.example.test'
assert.equal(connectionMode({ provider: 'gemini', networkMode: 'auto' }).useProxy, true)
assert.equal(connectionMode({ provider: 'deepseek', networkMode: 'auto' }).useProxy, false)
assert.equal(connectionMode({ provider: 'gemini', networkMode: 'direct' }).useProxy, false)
if (beforeProxy === undefined) delete process.env.EC_AI_PROXY_URL; else process.env.EC_AI_PROXY_URL = beforeProxy
for (const [status, message, expected] of [[503, 'high demand', /模型当前繁忙/], [429, 'quota limit: 0', /额度为 0/], [404, 'no longer available to new users', /新用户/], [400, 'thinking not supported', /模型默认/]]) {
  const error = await providerHttpError(Response.json([{ error: { message, status: 'ERROR' } }], { status }), 'gemini')
  assert.match(error.message, expected); assert.equal(error.status, 502)
}
const listed = await listAssistantModels({ provider: 'gemini', apiKey: 'test-only', fetcher: async () => Response.json({ models: [{ name: 'models/my-model' }, { name: 'models/my-model' }, { name: 'bad model' }] }) })
assert.deepEqual(listed, ['my-model'])
console.log(JSON.stringify({ ok: true, providers: ['DeepSeek', 'Gemini'], checks: ['context preserved', 'provider request format', 'streaming', 'uncertainty', 'invalid/truncated response', 'safe errors'], externalCalls: false }))
