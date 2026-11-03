"""Build a private course import from locally available videos and ASR results."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('catalog', type=Path)
    parser.add_argument('folder', type=Path)
    args = parser.parse_args()
    lessons = json.loads(args.catalog.read_text(encoding='utf8'))['items']
    items = []
    for lesson in lessons:
        episode = lesson['episode']
        filename = f'episode-{episode:02d}.mp4'
        video = args.folder / filename
        result = json.loads((args.folder / 'transcripts' / f'episode-{episode:02d}.json').read_text(encoding='utf8'))
        digest = hashlib.sha256(video.read_bytes()).hexdigest()
        if result.get('contentHash') != digest:
            raise ValueError('Transcript does not match video')
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True))
        segments = result['segments']
        previous = -1
        for part in segments:
            if not (0 <= part['start'] < part['end'] <= duration + 0.01 and previous <= part['start'] and part['text'].strip()):
                raise ValueError('Invalid course time axis')
            previous = part['start']
        if not segments or len(result['transcript']) < 100:
            raise ValueError('Incomplete course transcript')
        items.append({
            'file': filename, 'contentHash': digest, 'bytes': video.stat().st_size, 'kind': 'video',
            'title': f'走遍美国 {episode:02d} · {lesson["title"]}', 'courseId': 'family-album', 'episode': episode,
            'source': 'Family Album USA', 'sourceUrl': lesson['sourceUrl'], 'duration': duration,
            'level': 'A2', 'levelBasis': '课程目标参考 A2–B1／可调整',
            'transcript': result['transcript'], 'segments': segments,
            'transcription': {'engine': 'local-whisper', 'model': 'large-v3-turbo'},
        })
    if len(items) != 26 or len({item['contentHash'] for item in items}) != 26:
        raise ValueError('Expected 26 distinct completed episodes')
    (args.folder / 'manifest.json').write_text(json.dumps({'items': items}, ensure_ascii=False), encoding='utf8')
    print(json.dumps({'episodes': len(items), 'segments': sum(len(item['segments']) for item in items), 'bytes': sum(item['bytes'] for item in items)}))


if __name__ == '__main__':
    main()
