import assert from 'node:assert/strict'
import { buildReviewGame } from '../src/lib/reviewGame.ts'
const entries = ['curious','notice','take your time','one step at a time','relax'].map((text,i) => ({ id:String(i), text, kind:'word', tags:[], familiarity:'new', context:`I often say ${text} when learning English.`, enrichment:{ definitions:[], examples:[], definitionsZh:['好奇的','注意到','慢慢来','一步一步来','放松'][i] ? [['好奇的','注意到','慢慢来','一步一步来','放松'][i]] : [] } }))
const round = buildReviewGame(entries,5,()=>0.7)
assert.equal(round.length,5); assert.equal(new Set(round.map(q=>q.entryId)).size,5)
for(const q of round) { assert.equal(q.choices.length,3); assert.equal(new Set(q.choices).size,3); assert.ok(q.choices.includes(q.answer)); if(q.kind==='context')assert.ok(q.context.includes('_____')) }
assert.ok(round.some(q=>q.kind==='context'));assert.ok(round.some(q=>q.kind==='listen'))
assert.equal(buildReviewGame([entries[0]])[0].kind,'recall')
assert.equal(buildReviewGame([{...entries[0],deletedAt:'deleted'}]).length,0)
assert.equal(buildReviewGame([...entries,{...entries[0],id:'dup',text:' CURIOUS '}]).length,5)
assert.equal(entries[0].familiarity,'new')
const uncertain = buildReviewGame(entries.map(e=>({...e,enrichment:{...e.enrichment,aiUncertain:true}})),5,()=>0.7)
assert.ok(uncertain.every(q=>q.kind!=='meaning'))
console.log(JSON.stringify({ personalEntries:true,uniqueChoices:true,contextOriginal:true,listening:true,sparseFallback:true,deletedExcluded:true,noMasteryMutation:true,uncertainGlossExcluded:true }))
