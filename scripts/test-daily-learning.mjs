import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import { dailyContext, createDailyLearningApi } from '../nas/daily-learning.mjs'

const dataDir = resolve(`work/daily-learning-test-${process.pid}`)
mkdirSync(join(dataDir, 'media'), { recursive: true })
const entries = [{ id: 'known', text: 'easy', familiarity: 'usable' }, { id: 'weak', text: 'take a break', context: 'I take a break after work.', familiarity: 'new', createdAt: '2026-11-04' }, { id: 'deleted', text: 'hidden', deletedAt: '2026-11-04' }]
const materials = [{ id: 'book', title: 'My story', kind: 'book', level: 'A2', status: 'ready', readingPosition: { chapter: 0, paragraph: 1 }, chapters: [{ title: 'One', paragraphs: ['Not selected.', 'I take a break after work. I enjoy a cup of tea.'] }] }, { id: 'link', title: 'Personal external collection', kind: 'link', status: 'ready', transcript: 'Do not use collected external links.' }]
const context = dailyContext(entries, materials)
assert.equal(context.focus[0].id, 'weak')
assert.equal(context.entryCount, 2)
assert.equal(context.source.origin.paragraph, 1)
assert.ok(!context.source.excerpt.includes('Not selected'))
assert.ok(!context.choices.some(item => item.id === 'link'))
assert.throws(() => dailyContext(entries, materials, 'someone-else'), error => error.status === 404)
assert.equal(dailyContext([], [{ id: 'video', kind: 'video', status: 'ready', playbackPosition: 4, segments: [{ start: 0, end: 2, text: 'One.' }, { start: 3, end: 6, text: 'Two.' }] }]).source.origin.timestamp, 3)
let invalid = false, modelRequests = []
const fetcher = async (_url, init) => {
  const request = JSON.parse(init.body); modelRequests.push(request)
  if (request.stream) return new Response('data: {"choices":[{"delta":{"content":"Tell me about your tea break."}}]}\n\ndata: [DONE]\n\n')
  await new Promise(done => setTimeout(done, 30))
  const plan = invalid ? {} : { titleZh: '说说工作后的休息', reasonZh: '练习你尚不熟悉的 take a break', practiceTextEn: 'After work, I take a break. I enjoy a cup of tea.', englishMeanings: [{ text: 'take a break', meaningEn: 'stop working for a short time', exampleEn: 'Let us take a break.' }], gistQuestionEn: 'What do you do after work?', retellPromptEn: 'Tell me about the short story.', situationZh: '聊聊你的下班时光', openingQuestionEn: 'What helps you relax?', selfTalkPromptEn: 'Describe one small thing you enjoyed today.', helpZh: '先说自己已经会的短句。' }
  return Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] })
}
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); return true }
const readBody = async req => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body || '{}') }
const options = { dataDir, sendJson, getEntries: uid => uid === 'owner' ? entries : [], getMaterials: uid => uid === 'owner' ? materials : [], getAssistant: () => ({ provider: 'deepseek', apiKey: 'test-only', settings: { model: 'chosen-model', thinking: 'default' } }), fetcher }
let handle = createDailyLearningApi(options)
const server = createServer(async (req, res) => {
  const uid = { 'test-owner': 'owner', 'test-other': 'other' }[req.headers.authorization]
  try { await handle(req, res, new URL(req.url, 'http://localhost'), uid ? { id: uid } : null, readBody) }
  catch (error) { sendJson(res, error.status || 500, { message: error.message }) }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${server.address().port}/api/ai/daily`
async function api(path = '', method = 'GET', body, token = 'test-owner') { const response = await fetch(base + path, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, data: response.headers.get('content-type')?.includes('event-stream') ? await response.text() : await response.json() } }
try {
  assert.equal((await api('', 'GET', undefined, '')).status, 401)
  assert.equal((await api()).data.context.source.title, 'My story')
  const request = { date: '2026-11-04', profile: { level: 'A2', minutes: 10, interests: '工作与散步' } }
  const concurrent = await Promise.all([api('/plan', 'POST', request), api('/plan', 'POST', request)])
  assert.deepEqual(concurrent.map(item => item.status).sort(), [201, 429])
  const session = concurrent.find(item => item.status === 201).data.session
  const input = JSON.parse(modelRequests[0].messages[1].content)
  assert.equal(input.profile.level, 'A2'); assert.equal(input.focus[0].text, 'take a break')
  assert.equal(modelRequests[0].model, 'chosen-model')
  assert.equal((await api('/session/' + session.id, 'GET', undefined, 'test-other')).status, 404)
  await api('/session/' + session.id, 'PATCH', { completed: ['understand', 'retell', 'invented'], rating: 'hard', reflection: 'Need simpler questions.', retelling: 'I take a break with tea.' })
  const chat = await api('/chat', 'POST', { sessionId: session.id, message: 'I drink tea.' })
  assert.ok(chat.data.includes('Tell me about your tea break.')); assert.ok(chat.data.includes('"done":true'))
  let saved = (await api('/session/' + session.id)).data.session
  assert.equal(saved.turns.length, 2); assert.deepEqual(saved.completed, ['understand', 'retell'])
  handle = createDailyLearningApi(options)
  assert.equal((await api('/session/' + session.id)).data.session.turns[1].content, 'Tell me about your tea break.')
  const second = await api('/plan', 'POST', request)
  const nextInput = JSON.parse(modelRequests.findLast(item => !item.stream).messages[1].content)
  assert.equal(nextInput.recent[0].rating, 'hard')
  assert.equal(nextInput.recent[0].retelling, 'I take a break with tea.')
  assert.equal(second.status, 201)
  invalid = true
  assert.equal((await api('/plan', 'POST', request)).status, 502)
  assert.equal((await api()).data.history.length, 2)
  assert.ok(!readFileSync(join(dataDir, 'media/daily-learning.json'), 'utf8').includes('test-only'))
  console.log(JSON.stringify({ ok: true, sourceAtReadingPosition: true, timedSourceAtPlayback: true, weakWordsPrioritized: true, personalLinksExcluded: true, accountIsolation: true, chatSavedAcrossRestart: true, difficultyFeedbackUsed: true, failedPlanPreservesHistory: true, concurrentGenerationGuard: true, externalAiCalls: false }))
} finally { await new Promise(done => server.close(done)) }
