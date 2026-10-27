import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'

const sources=JSON.parse(fs.readFileSync('materials/starter-pack.sources.json','utf8'))
const root=path.resolve(process.argv[2]||'work/materials/'+sources.id)
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'))
const inventory=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'),'utf8'))
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const normalize=text=>text.toLowerCase().replace(/[’]/g,"'").replace(/[…]/g,'').replace(/[^a-z0-9']+/g,' ').trim()

if(catalog.items.length!==sources.lessons.length)throw new Error('Catalog lesson count differs from source selection')
for(const record of inventory.files){
  if(path.isAbsolute(record.path)||record.path.includes('..'))throw new Error('Unsafe inventory path: '+record.path)
  const bytes=fs.readFileSync(path.join(root,record.path))
  if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw new Error('Inventory mismatch: '+record.path)
}
for(const item of catalog.items){
  const transcript=normalize(item.lines.map(line=>line.text).join(' '))
  for(const phrase of item.focus){if(!transcript.includes(normalize(phrase)))throw new Error(`Focus phrase not found in ${item.slug}: ${phrase}`)}
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',path.join(root,item.audio)],{encoding:'utf8'}))
  const duration=Number(probe.format?.duration)
  if(!probe.streams?.some(stream=>stream.codec_type==='audio')||Math.abs(duration-item.durationSeconds)>.02)throw new Error('Audio probe mismatch: '+item.slug)
}
const context={window:{}}
vm.runInNewContext(fs.readFileSync(path.join(root,'catalog.js'),'utf8'),context)
if(context.window.ENGLISH_CLIP_STARTER?.id!==catalog.id)throw new Error('catalog.js differs from catalog.json')
const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(Boolean)
for(const script of inlineScripts)new Function(script)
if(!/catalog\.js/.test(html)||!/<audio\b/.test(html)||!/设 A 点/.test(html)||!/复制选中文字/.test(html))throw new Error('Practice page is missing a required control')
console.log(JSON.stringify({ok:true,root,lessons:catalog.items.length,totalDurationSeconds:catalog.totalDurationSeconds,verifiedFiles:inventory.files.length}))
