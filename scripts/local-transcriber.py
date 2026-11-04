"""Outbound-only NAS transcription worker using the user's existing subtitle tool.

Run under that tool's Python environment; no packages or models are downloaded.
Credentials are requested privately and retained only in memory.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tool-root', required=True, type=Path)
    parser.add_argument('--model', default='large-v3-turbo')
    parser.add_argument('--cuda-lib', action='append', type=Path, default=[], help='Existing local CUDA DLL directory; affects this worker process only')
    parser.add_argument('--server', default='https://clip.evenhoo.top:8443')
    parser.add_argument('--email', default='')
    parser.add_argument('--file', type=Path, help='Offline verification: transcribe this file only')
    parser.add_argument('--batch-manifest', type=Path, help='Offline batch: transcribe untranscribed audio in a prepared private manifest')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    dll_handles = []
    for directory in args.cuda_lib:
        if not directory.is_dir(): raise ValueError('CUDA library directory does not exist')
        os.environ['PATH'] = str(directory) + os.pathsep + os.environ.get('PATH', '')
        if os.name == 'nt': dll_handles.append(os.add_dll_directory(str(directory.resolve())))
    sys.path.insert(0, str(args.tool_root / 'src' / 'backend'))
    from asr_worker import load_whisper_model
    print('Loading installed local model; no model download.', flush=True)
    model, device, compute_type, model_path = load_whisper_model(args.model, args.tool_root / 'models')
    print('Local model ready on ' + device, flush=True)

    def transcribe(path):
        nonlocal model, device
        import numpy as np
        import wave
        with tempfile.TemporaryDirectory(prefix='english-clip-pcm-') as folder:
            pcm = Path(folder) / 'audio.wav'
            subprocess.run(['ffmpeg', '-nostdin', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(pcm)], check=True, timeout=600)
            with wave.open(str(pcm), 'rb') as audio:
                samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        def decode():
            parts, info = model.transcribe(samples, language='en', beam_size=3, vad_filter=True, word_timestamps=True)
            duration = len(samples) / 16000
            return [{'start': round(s.start, 3), 'end': round(min(s.end, duration), 3), 'text': s.text.strip(), 'words': [{'start': round(max(s.start, w.start), 3), 'end': round(min(w.end, s.end, duration), 3), 'text': w.word.strip()} for w in (s.words or []) if w.end > w.start and w.start < duration and w.word.strip()]} for s in parts if s.start < duration and s.end > s.start and s.text.strip()]
        try: segments = decode()
        except RuntimeError:
            if device != 'cuda': raise
            print('GPU runtime unavailable; retrying with the installed model on CPU.', flush=True)
            from faster_whisper import WhisperModel
            model = WhisperModel(str(model_path), device='cpu', compute_type='int8', local_files_only=True)
            device = 'cpu'
            segments = decode()
        return {'transcript': ' '.join(s['text'] for s in segments), 'segments': segments}

    if args.batch_manifest:
        if not args.output: raise ValueError('--output must name a private result directory')
        args.output.mkdir(parents=True, exist_ok=True)
        manifest = json.loads(args.batch_manifest.read_text(encoding='utf8'))
        jobs = [item for item in manifest['items'] if item['kind'] in ('audio', 'video') and not item.get('transcript')]
        for index, item in enumerate(jobs):
            target = args.output / (item['contentHash'] + '.json')
            if target.exists():
                saved = json.loads(target.read_text(encoding='utf8'))
                if saved.get('contentHash') == item['contentHash'] and saved.get('transcript') and saved.get('segments'):
                    print(f'Batch {index+1}/{len(jobs)} already complete', flush=True)
                    continue
            print(f'Batch {index+1}/{len(jobs)}: {item["title"]}', flush=True)
            result = transcribe(args.batch_manifest.parent / item['file'])
            if not result['transcript']: raise RuntimeError('No speech recognized: ' + item['title'])
            result.update(contentHash=item['contentHash'], title=item['title'], device=device)
            tmp = target.with_suffix('.tmp')
            tmp.write_text(json.dumps(result, ensure_ascii=False), encoding='utf8'); tmp.replace(target)
            print(json.dumps({'completed': index+1, 'total':len(jobs), 'segments':len(result['segments'])}), flush=True)
        print(json.dumps({'batchComplete':True,'total':len(jobs)}), flush=True)
        return
    if args.file:
        result = transcribe(args.file)
        if not result['transcript']: raise RuntimeError('No speech recognized')
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf8')
        print(json.dumps({'ok': True, 'device': device, 'segments': len(result['segments']), 'characters': len(result['transcript'])}))
        return
    parsed = urlparse(args.server)
    if parsed.scheme != 'https' and parsed.hostname not in ('127.0.0.1', 'localhost'):
        raise ValueError('Remote NAS connection requires HTTPS')
    base = args.server.rstrip('/')
    email = args.email or input('NAS email: ').strip()
    password = getpass.getpass('NAS password (not saved): ')

    def api(path, body=None, token=''):
        headers = {'Content-Type': 'application/json'}
        if token: headers['Authorization'] = 'Bearer ' + token
        request = Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        with urlopen(request, timeout=60) as response: return json.load(response)

    token = api('/api/auth/login', {'email': email, 'password': password})['token']
    password = ''
    print('Connected. Waiting for your local transcription queue. Ctrl+C stops.', flush=True)
    while True:
        jobs = api('/api/local/jobs', token=token)['items']
        for item in jobs:
            path = '/api/media/' + item['id'] + '/local'
            try:
                api(path, {'claim': True}, token)
            except Exception:
                continue
            try:
                print('Transcribing: ' + item['title'], flush=True)
                with tempfile.TemporaryDirectory(prefix='english-clip-') as folder:
                    target = Path(folder) / ('source.' + item['extension'])
                    with urlopen(base + item['streamUrl'], timeout=120) as response, target.open('wb') as output:
                        while chunk := response.read(1024 * 1024): output.write(chunk)
                    result = transcribe(target)
                    if not result['transcript']: raise RuntimeError('No speech recognized')
                    api(path, result, token)
                print('Transcript and exercises saved to NAS.', flush=True)
            except Exception as error:
                print('Job failed: ' + type(error).__name__, flush=True)
                try: api(path, {'error': '本机转写失败，请检查电脑助手后重试'}, token)
                except Exception: pass
        if args.once: break
        time.sleep(8)


if __name__ == '__main__':
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    try: main()
    except KeyboardInterrupt: print('Stopped.')
