"""Index public course titles and existing embed IDs; do not copy video or lesson text."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html import unescape
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

def main():
    p=argparse.ArgumentParser();p.add_argument('--index-file',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--proxy',default='');args=p.parse_args()
    source=args.index_file.read_text(encoding='utf8');urls={}
    for value in re.findall(r'href=[\"\x27]([^\"\x27]+)',source):
        path=urlsplit(unescape(value)).path
        match=re.search(r'family-album-usa-episode-(\d+)-',path)
        if match and 1<=int(match[1])<=26:urls[int(match[1])]='https://www.learnrealeng.com'+path
    if len(urls)!=26:raise ValueError(f'Expected 26 source episodes, found {len(urls)}')
    def read(item):
        number,url=item
        command=['curl.exe','-fsSL','--max-time','30','--retry','2']
        if args.proxy:command+=['-x',args.proxy]
        page=subprocess.check_output(command+[url],stderr=subprocess.DEVNULL).decode('utf8','replace')
        ids=list(dict.fromkeys(re.findall(r'youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{11})',page)))
        if not ids:raise ValueError(f'No actual embed found for episode {number}')
        title=unescape(re.search(r'<title>(.*?)</title>',page,re.S).group(1)).split(' | ')[0]
        title=re.sub(r'^Family Album USA\s*-\s*Episode\s*\d+\s*-\s*','',title,flags=re.I)
        return {'episode':number,'title':title,'videoId':ids[0],'sourceUrl':url}
    with ThreadPoolExecutor(max_workers=5) as pool:items=sorted(pool.map(read,urls.items()),key=lambda i:i['episode'])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'title':'走遍美国','englishTitle':'Family Album USA','levelReference':'A2–B1','sourceUrl':'https://www.learnrealeng.com/p/family-album-usa-family-album-u.html','delivery':'private-nas-training','items':items},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'episodes':len(items),'uniqueEmbeds':len(set(i['videoId'] for i in items)),'videoFilesDownloaded':0}))

if __name__=='__main__':main()
