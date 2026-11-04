import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, statSync, renameSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { catalogLibrary, catalogItem } from '../nas/catalog-library.mjs'
const root=resolve(`work/readable-catalog-test-${process.pid}`),data=join(root,'data'),library=join(root,'library'),originals=join(data,'media/files/owner')
mkdirSync(originals,{recursive:true})
const items={}
for(const id of ['one','two']){writeFileSync(join(originals,id+'.mp4'),'test media '+id);items[id]={id,ownerId:'owner',extension:'mp4',kind:'lesson',title:'认识新朋友',source:'VOA Learning English',contentHash:id,notes:[{text:'keep note'}],segments:[{start:0,end:1,text:'Hello.',translation:'你好。',words:[{start:0,end:1,text:'Hello.'}]}]}}
const index=join(data,'media/index.json');writeFileSync(index,JSON.stringify({owner:items}))
assert.equal(catalogLibrary(data,library).cataloged,2)
const saved=JSON.parse(readFileSync(index,'utf8')).owner
assert.notEqual(saved.one.libraryPath,saved.two.libraryPath)
for(const item of Object.values(saved)){const file=join(library,item.libraryPath);assert.equal(statSync(file).ino,statSync(join(originals,item.id+'.mp4')).ino);assert.equal(readFileSync(file,'utf8'),'test media '+item.id);assert.deepEqual(item.notes,[{text:'keep note'}]);assert.ok(existsSync(file.replace(/\.mp4$/,'.zh.srt')))}
const moved=join(library,'视频/精选/VOA Learning English/新名字.mp4');renameSync(join(library,saved.one.libraryPath),moved)
catalogLibrary(data,library);assert.ok(JSON.parse(readFileSync(index,'utf8')).owner.one.libraryPath.endsWith('新名字.mp4'))
assert.ok(existsSync(join(originals,'one.mp4')))
assert.throws(()=>catalogItem({...saved.one,libraryPath:'../escape.mp4'},data,library))
const long={...saved.one,id:'long',title:'中'.repeat(200),libraryPath:undefined};writeFileSync(join(originals,'long.mp4'),'long');catalogItem(long,data,library);assert.ok(Buffer.byteLength(long.libraryPath.split('/').pop(),'utf8')<255)
console.log(JSON.stringify({ok:true,checks:['human names','zero-copy hard links','collision protection','renamed catalog path adopted','legacy originals and notes preserved','bilingual sidecars','path escape rejected','UTF-8 filename fits filesystem']}))
