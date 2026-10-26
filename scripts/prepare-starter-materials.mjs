/** Download a deliberately selected public, educational ELLLO starter pack.
 * Files and full transcripts go to ignored work/, not into program releases.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const config=JSON.parse(fs.readFileSync('materials/starter-pack.sources.json','utf8'))
const root=path.resolve(process.argv[2]||'work/materials/'+config.id)
fs.mkdirSync(root,{recursive:true})
for(const dir of ['audio','transcripts','metadata','provenance'])fs.mkdirSync(path.join(root,dir),{recursive:true})
const unescape=s=>s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
const clean=s=>unescape(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()
const splitTurns=paragraph=>{
  const starts=[...paragraph.matchAll(/(?:^|\s)([A-Z][A-Za-z.'-]{1,24}):\s/g)].map(match=>match.index+(match[0].startsWith(' ')?1:0))
  return starts.length<2?[paragraph]:starts.map((start,index)=>paragraph.slice(start,starts[index+1]??paragraph.length).trim()).filter(Boolean)
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function request(url){const u=new URL(url);if(u.protocol!=='https:'||!['elllo.org','www.elllo.org','www.manythings.org'].includes(u.hostname))throw new Error('Unexpected source host');const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(url+' HTTP '+r.status);return r}
async function text(url){return (await request(url)).text()}
const evidence=[]
for(const [i,url] of config.permissionEvidence.entries()){const body=await text(url);fs.writeFileSync(path.join(root,'provenance','permission-'+(i+1)+'.html'),body);evidence.push({url,sha256:sha(body)})}
const items=[]
for(const lesson of config.lessons){
  const indexUrl='https://www.manythings.org/elllo/'+lesson.index+'.html'
  const reformatted=await text(indexUrl)
  const hrefs=[...reformatted.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1])
  const sourceUrl=hrefs.find(u=>/elllo\.org\/english\//.test(u))?.replace(/^http:/,'https:')
  if(!sourceUrl)throw new Error('Missing original source for '+lesson.slug)
  const original=await text(sourceUrl)
  let audioRef=[...original.matchAll(/(?:src|href)=["']([^"']+\.mp3[^"']*)["']/gi)].map(m=>m[1])[0]
  const audioUrl=audioRef?new URL(audioRef,sourceUrl).href:hrefs.find(u=>/elllo\.org\/Audio\/.*\.mp3/.test(u))?.replace(/^http:/,'https:')
  if(!audioUrl)throw new Error('Missing audio for '+lesson.slug)
  const transcriptStart=original.search(/<div[^>]+(?:id|class)=["']transcript["']/i)
  const transcriptBlock=transcriptStart>=0?original.slice(transcriptStart).split(/<div[^>]+id=["']view2["']/i)[0]:''
  let lines=[...transcriptBlock.matchAll(/<p\b[^>]*>([\s\S]*?)(?=<p\b|<\/p>|<\/div>)/gi)].map(m=>clean(m[1])).filter(s=>/^[A-Za-z][A-Za-z .'-]{0,35}:\s/.test(s)).flatMap(splitTurns)
  let transcriptSourceUrl=sourceUrl
  if(lines.length<4){lines=[...reformatted.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m=>clean(m[1])).filter(s=>/^[A-Za-z][A-Za-z .'-]{0,35}:\s/.test(s)).flatMap(splitTurns);transcriptSourceUrl=indexUrl}
  if(lines.length<4)throw new Error('Could not safely extract transcript: '+lesson.slug)
  const title=clean(reformatted.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||lesson.slug)
  const filename=decodeURIComponent(new URL(audioUrl).pathname.split('/').pop())
  if(!/^[\w .-]+\.mp3$/i.test(filename))throw new Error('Unsafe audio filename')
  const audioBytes=Buffer.from(await (await request(audioUrl)).arrayBuffer())
  if(audioBytes.length<10000||audioBytes.subarray(0,200).toString().includes('<html'))throw new Error('Invalid audio download')
  const audioPath=path.join(root,'audio',filename);if(fs.existsSync(audioPath)&&sha(fs.readFileSync(audioPath))!==sha(audioBytes))throw new Error('Refusing to overwrite different original audio')
  fs.writeFileSync(audioPath,audioBytes)
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type','-of','json',audioPath],{encoding:'utf8'}))
  const duration=Number(probe.format?.duration);if(!Number.isFinite(duration)||duration<10||!probe.streams?.some(s=>s.codec_type==='audio'))throw new Error('Audio validation failed')
  const transcriptPath='transcripts/'+lesson.slug+'.txt';const transcript=lines.join('\n\n')+'\n';fs.writeFileSync(path.join(root,transcriptPath),transcript)
  fs.writeFileSync(path.join(root,'provenance',lesson.slug+'.source.html'),original)
  const who=clean(reformatted.match(/<p class=["']who["']>([\s\S]*?)<\/p>/i)?.[1]||'见原课程页面')
  const item={id:'elllo-starter-'+lesson.slug,slug:lesson.slug,title,titleZh:lesson.titleZh,topic:lesson.topic,provider:'ELLLO',speakers:who,level:'High Beginner（选编站点分组）',sourceUrl,transcriptSourceUrl,audioSourceUrl:audioUrl,audio:'audio/'+filename,audioBytes:audioBytes.length,audioSha256:sha(audioBytes),durationSeconds:Math.round(duration*100)/100,transcript:transcriptPath,transcriptSha256:sha(transcript),lines:lines.map((text,index)=>({id:'line-'+index,text})),timingStatus:'原文没有逐句时间标记；请手动设定循环，不提供猜测时间轴。',focus:lesson.focus,focusNote:'选编练习方向，具体说法以原音频和原文为准。',retell:lesson.retell,permissionEvidence:config.permissionEvidence,usage:config.usage}
  fs.writeFileSync(path.join(root,'metadata',lesson.slug+'.json'),JSON.stringify(item,null,2)+'\n');items.push(item)
  console.log(JSON.stringify({lesson:lesson.slug,title,durationSeconds:item.durationSeconds,audioBytes:audioBytes.length,lines:lines.length}))
}
const catalog={id:config.id,title:config.title,preparedAt:new Date().toISOString(),provider:config.provider,usage:config.usage,permissionEvidence:evidence,totalDurationSeconds:Math.round(items.reduce((s,m)=>s+m.durationSeconds,0)),items}
fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n')
fs.writeFileSync(path.join(root,'catalog.js'),'window.ENGLISH_CLIP_STARTER='+JSON.stringify(catalog).replace(/</g,'\\u003c')+';\n')
fs.copyFileSync(path.resolve('materials/starter-pack-index.html'),path.join(root,'index.html'))
const inventory=[];for(const dir of ['audio','transcripts','metadata'])for(const file of fs.readdirSync(path.join(root,dir))){const relative=dir+'/'+file;const bytes=fs.readFileSync(path.join(root,relative));inventory.push({path:relative,bytes:bytes.length,sha256:sha(bytes)})}
for(const relative of ['index.html','catalog.json','catalog.js']){const bytes=fs.readFileSync(path.join(root,relative));inventory.push({path:relative,bytes:bytes.length,sha256:sha(bytes)})}
fs.writeFileSync(path.join(root,'inventory.json'),JSON.stringify({id:config.id,files:inventory},null,2)+'\n')
console.log(JSON.stringify({root,items:items.length,totalDurationSeconds:catalog.totalDurationSeconds,verifiedFiles:inventory.length}))
