import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { explainExpression, streamConversation } from '../nas/deepseek.mjs'

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
console.log(JSON.stringify({ ok: true, providers: ['DeepSeek', 'Gemini'], checks: ['context preserved', 'provider request format', 'streaming', 'uncertainty', 'invalid/truncated response', 'safe errors'], externalCalls: false }))
