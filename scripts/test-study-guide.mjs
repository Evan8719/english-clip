import assert from 'node:assert/strict'
import { generateStudyGuide } from '../nas/study-guide.mjs'
const segments = [{ start: 4, end: 8, text: 'Could you help me with this?' }, { start: 30, end: 34, text: 'I look forward to meeting you.' }]
const item = { title: 'Grounding test', transcript: segments.map(s => s.text).join(' '), segments }
let sent
const fetcher = async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: '礼貌求助与期待', goals: ['礼貌求助'], points: [
  { title: 'Could you…?', example: segments[0].text, explanation: '礼貌请求', segmentIndex: 0, start: 999 },
  { title: 'look forward to', example: segments[1].text, explanation: 'to 后接动名词', segmentIndex: 1 },
  { title: 'invented', example: 'A fabricated quote.', segmentIndex: 0 },
], questions: [{ question: 'What does the speaker ask for?', answer: 'Help.' }, { question: 'What is the speaker looking forward to?', answer: 'Meeting you.' }] }) } }] }) }
const guide = await generateStudyGuide(item, 'test-only', fetcher)
assert.equal(guide.points.length, 2)
assert.equal(guide.points[0].start, 4)
assert.equal(guide.points[1].example, segments[1].text)
assert.equal(sent.response_format.type, 'json_object')
assert.equal(sent.thinking.type, 'disabled')
await assert.rejects(generateStudyGuide({ transcript: '' }, 'test-only', fetcher), /原文/)
console.log(JSON.stringify({ ok: true, checks: ['invented quotes rejected', 'timestamps derived from source only', 'missing transcript rejected', 'bounded structured guide'] }))
