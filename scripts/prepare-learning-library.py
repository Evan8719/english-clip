"""Prepare private audio/EPUB data for the offline NAS importer; never edits originals."""
import argparse
from pathlib import Path
import hashlib
from html.parser import HTMLParser
import json
import posixpath
import re
import shutil
from urllib.parse import unquote
import xml.etree.ElementTree as ET
import zipfile

class TextBlocks(HTMLParser):
    def __init__(self):
        super().__init__(); self.blocks=[]; self.buffer=[]; self.skip=0
    def flush(self):
        text=' '.join(''.join(self.buffer).split())
        if text: self.blocks.append(text)
        self.buffer=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','nav'): self.skip+=1
        if tag in ('p','h1','h2','h3','blockquote'): self.flush()
    def handle_endtag(self, tag):
        if tag in ('p','h1','h2','h3','blockquote'): self.flush()
        if tag in ('script','style','nav'): self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip: self.buffer.append(data)

def book_data(path):
    with zipfile.ZipFile(path) as z:
        if z.testzip(): raise ValueError('EPUB CRC check failed')
        container=ET.fromstring(z.read('META-INF/container.xml'))
        opf_path=container.find('.//{*}rootfile').attrib['full-path']; opf=ET.fromstring(z.read(opf_path))
        manifest={i.attrib['id']:i.attrib['href'] for i in opf.findall('.//{*}manifest/{*}item')}
        chapters=[]
        for item in opf.findall('.//{*}spine/{*}itemref'):
            name=posixpath.normpath(posixpath.join(posixpath.dirname(opf_path),unquote(manifest[item.attrib['idref']].split('#')[0])))
            parser=TextBlocks(); parser.feed(z.read(name).decode('utf8','replace')); parser.flush()
            if parser.blocks: chapters.append({'title':parser.blocks[0][:180], 'paragraphs':parser.blocks})
        if not chapters: raise ValueError('No readable chapters')
        title=opf.find('.//{*}title');author=opf.find('.//{*}creator')
        return {'title':title.text if title is not None else path.stem,'author':author.text if author is not None else '', 'chapters':chapters}

def estimate(text):
    words=re.findall('[A-Za-z]+',text)
    if len(words)<30:return ''
    score=len(words)/max(1,len(re.findall('[.!?]+',text)))+sum(len(w)>7 for w in words)/len(words)*35
    return next((level for threshold,level in [(12,'A1'),(17,'A2'),(23,'B1'),(30,'B2'),(38,'C1')] if score<threshold),'C2')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True);(args.output/'files').mkdir(exist_ok=True)
    items=[];failed=[]
    for path in sorted(args.source.rglob('*')):
        if path.suffix.lower() not in ('.mp3','.epub'):continue
        try:
            raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest();name='files/'+digest+path.suffix.lower()
            item={'file':name,'contentHash':digest,'bytes':len(raw),'kind':'book' if path.suffix.lower()=='.epub' else 'audio','title':path.stem,'source':'','transcript':'','level':'','levelBasis':'待评估'}
            if item['kind']=='book':
                item.update(book_data(path));item['source']='Project Gutenberg · 原著'
                sample=' '.join(p for c in item['chapters'][:6] for p in c['paragraphs'])
                item['level']=estimate(sample);item['levelBasis']='文本粗估／原著非分级读物'
            else:
                paired=path.with_suffix('.txt')
                if paired.exists():
                    text=paired.read_text(encoding='utf8');item['transcript']=re.split(r'\nREAD\s*\n',text,maxsplit=1)[-1].strip()
                    match=re.search(r'^Source:\s*(https://\S+)',text,re.M);item['source']='Listen A Minute';item['sourceUrl']=match.group(1) if match else ''
                    item['title']=path.stem[2:].replace('_',' ').title();item['level']=estimate(item['transcript']);item['levelBasis']='文本粗估／可调整'
                else:
                    item['source']=path.stem.split(' - ')[0].replace('_',' ')
                    item['level']='A2' if item['source']=='ESLPod' else 'B2';item['levelBasis']='节目类型参考／未听评'
            if not (args.output/name).exists():shutil.copyfile(path,args.output/name)
            items.append(item)
        except Exception as error:failed.append({'name':path.name,'reason':str(error)})
    (args.output/'manifest.json').write_text(json.dumps({'items':items},ensure_ascii=False),encoding='utf8')
    (args.output/'report.json').write_text(json.dumps({'prepared':len(items),'failed':failed},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'prepared':len(items),'books':sum(i['kind']=='book' for i in items),'audio':sum(i['kind']=='audio' for i in items),'failed':len(failed)}))

if __name__=='__main__':main()
