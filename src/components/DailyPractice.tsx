import { useCallback, useEffect, useRef, useState } from 'react'
import type { DailyOverview, DailyProfile, DailySession } from '../lib/daily'
import { generateDaily, getDailyOverview, getDailySession, saveDailyProgress } from '../lib/daily'
import { chatWithAi } from '../lib/media'
import { getStoredUserId } from '../lib/sync'
import { getDb } from '../db/database'
import { speakEnglish } from '../lib/speech'
import { VoiceInput } from './VoiceInput'
import { NavIcon } from './NavIcon'
import type { Entry } from '../types'

const steps = [{ id: 'understand', title: '理解', icon: 'book' }, { id: 'shadow', title: '跟读', icon: 'audio' }, { id: 'retell', title: '复述', icon: 'mic' }, { id: 'talk', title: '对话', icon: 'chat' }] as const
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
type Cache = { session: DailySession; pending: boolean }

export function DailyPractice({ active, entries, onShadow, onOrigin, onCapture }: { active: boolean; entries: Entry[]; onShadow: (text: string) => void; onOrigin?: (origin: NonNullable<Entry['enrichment']>['origin']) => void; onCapture: (seed: { text: string; context?: string }) => void }) {
  const uid = getStoredUserId() || 'local', cacheKey = 'daily-cache:' + uid
  const [overview, setOverview] = useState<DailyOverview | null>(null)
  const [profile, setProfile] = useState<DailyProfile>({ level: 'A2', minutes: 10, interests: '日常生活' })
  const [materialId, setMaterialId] = useState('')
  const [session, setSession] = useState<DailySession | null>(null)
  const current = useRef(session), revision = useRef(0)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [step, setStep] = useState(0), [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  const [answer, setAnswer] = useState(''), [voiceReply, setVoiceReply] = useState(false), [voiceSend, setVoiceSend] = useState(false)
  const controller = useRef<AbortController | null>(null), isActive = useRef(active)
  isActive.current = active
  const change = useCallback((value: DailySession, dirty: boolean) => { current.current = value; pendingRef.current = dirty; revision.current++; setSession(value); setPending(dirty) }, [])
  const persist = useCallback(async (value: DailySession, dirty: boolean) => { const db = await getDb(), cache = { session: value, pending: dirty }; await db.put('meta', { key: cacheKey, value: cache }); await db.put('meta', { key: `${cacheKey}:${value.id}`, value: cache }) }, [cacheKey])
  const openSession = useCallback(async (id: string) => {
    const cached = (await (await getDb()).get('meta', `${cacheKey}:${id}`))?.value as Cache | undefined
    if (cached?.pending) { change(cached.session, true); return }
    try { change((await getDailySession(id)).session, false) } catch (error) { if (cached) change(cached.session, cached.pending); else throw error }
  }, [cacheKey, change])
  useEffect(() => {
    let mounted = true
    void (async () => {
      const cached = (await (await getDb()).get('meta', cacheKey))?.value as Cache | undefined
      if (!mounted) return
      if (cached) change(cached.session, cached.pending)
      try {
        const value = await getDailyOverview()
        if (!mounted) return
        setOverview(value); setProfile(value.profile)
        const today = value.history.find(item => item.date === localDate())
        if (today && !cached?.pending && revision.current <= (cached ? 1 : 0)) await openSession(today.id)
      } catch (error) { if (mounted) setMessage(cached ? '已打开本机缓存；联网后可同步练习。' : (error as Error).message) }
    })()
    return () => { mounted = false; controller.current?.abort() }
  }, [cacheKey, change, openSession])
  useEffect(() => { if (!session) return; const timer = window.setTimeout(() => { void persist(session, pending).catch(() => setMessage('本机保存失败，请检查设备存储空间')) }, 300); return () => window.clearTimeout(timer) }, [session, pending, persist])
  useEffect(() => { if (!active) { controller.current?.abort(); window.speechSynthesis?.cancel() } }, [active])
  const speak = (value: string) => { void speakEnglish(value).catch(() => setMessage('朗读不可用，请检查设备语音设置')) }
  async function syncProgress(next = current.current) {
    if (!next || busy) return
    change(next, true); const version = revision.current
    setBusy('save'); setMessage('')
    let cached = false
    try {
      await persist(next, true); cached = true
      const saved = (await saveDailyProgress(next)).session
      if (revision.current === version) { change(saved, false); setMessage('练习已保存到 NAS') } else setMessage('已保存此前内容，新修改仍待同步')
    } catch { setMessage(cached ? '本机草稿已保留；联网后点“保存练习”重试同步。' : '本机保存失败，请保持页面并检查存储空间后重试。') }
    finally { setBusy('') }
  }
  async function generate() {
    if (busy) return
    setBusy('generate'); setMessage('')
    try {
      if (current.current) await persist(current.current, pending)
      const value = await generateDaily(profile, localDate(), materialId)
      change(value.session, false); setStep(0); setAnswer('')
      setOverview(await getDailyOverview(materialId))
    } catch (error) { setMessage((error as Error).message) } finally { setBusy('') }
  }
  async function send(spoken?: string) {
    const value = (spoken || answer).trim(), before = current.current
    if (!value || !before || busy) return
    const turns = [...before.turns, { role: 'user' as const, content: value }, { role: 'assistant' as const, content: '' }]
    setBusy('chat'); setMessage(''); controller.current = new AbortController()
    change({ ...before, turns }, pending)
    let reply = ''
    try {
      await chatWithAi(value, '', [], delta => { reply += delta; if (current.current?.id === before.id) change({ ...current.current, turns: [...turns.slice(0, -1), { role: 'assistant', content: reply }] }, pendingRef.current) }, controller.current.signal, before.id)
      const saved = (await getDailySession(before.id)).session
      const latest = current.current
      change(pendingRef.current && latest ? { ...saved, retelling: latest.retelling, reflection: latest.reflection, completed: latest.completed, rating: latest.rating } : saved, pendingRef.current)
      setAnswer(''); if (voiceReply && isActive.current && reply) speak(reply)
    } catch (error) { setMessage((error as Error).name === 'AbortError' ? '已停止，可稍后继续这次对话' : (error as Error).message); if (!reply && current.current) change({ ...current.current, turns: turns.slice(0, -1) }, pendingRef.current) }
    finally { setBusy('') }
  }
  const context = overview?.context
  return <div className="daily-practice">
    <div className="daily-intro">{!session && <span className="redesign-tag">每天一点，按自己的节奏</span>}<h2>{session?.plan.titleZh || '把英文，接到今天的生活里'}</h2><p>{session?.plan.reasonZh || '从自己的词句和素材出发，先理解，再说自己的话。'}</p></div>
    <div className={session ? 'daily-controls compact' : 'daily-controls'}>
    <details className="daily-preferences" open={!session}><summary>练习参考 · {profile.level} · {profile.minutes} 分钟</summary><fieldset disabled={Boolean(busy)}><label>参考等级<select aria-label="每日练习等级" value={profile.level} onChange={e => setProfile({ ...profile, level: e.target.value })}>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => <option key={level}>{level}</option>)}</select></label><label>可用时间<select aria-label="每日练习时长" value={profile.minutes} onChange={e => setProfile({ ...profile, minutes: Number(e.target.value) })}>{[5, 10, 20, 30].map(minutes => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label><label>生活场景<input aria-label="每日练习生活场景" value={profile.interests} maxLength={160} onChange={e => setProfile({ ...profile, interests: e.target.value })} placeholder="例如：工作、散步、旅行" /></label><label>使用素材<select aria-label="每日练习素材" value={materialId} onChange={e => { setMaterialId(e.target.value); void getDailyOverview(e.target.value).then(setOverview).catch((error: Error) => setMessage(error.message)) }}><option value="">按最近学习位置选择</option>{context?.choices?.map(item => <option key={item.id} value={item.id}>{item.level ? item.level + ' · ' : ''}{item.title}</option>)}</select></label></fieldset><p className="muted tiny">等级是可调整的练习参考。生成时只取少量词句、选中素材的短片段和近期每日练习反馈，发送给当前 AI。</p></details>
    {!session && <div className="daily-basis"><span className="muted tiny">这次将参考</span><p>{context?.source?.title || '本子里的表达与生活场景'}</p><div className="daily-focus-chips">{(context?.focus || entries.slice(0, 3)).map(item => <span key={item.id}>{item.text}</span>)}</div>{context?.source && <details><summary>查看将使用的原文片段</summary><p>{context.source.excerpt}</p></details>}</div>}
    <button type="button" className={session ? 'redesign-text-button' : 'redesign-primary'} disabled={Boolean(busy)} onClick={() => void generate()}>{busy === 'generate' ? '正在安排练习…' : session ? '换一组练习' : '生成今日练习'}</button>
    </div>
    {session && <>
      <div className="daily-session-meta"><span>{session.date} · {session.profile.level} · 约 {session.profile.minutes} 分钟</span><span>{busy === 'chat' ? '对话中…' : pending ? '本机草稿待同步' : '已保存到 NAS'}</span></div>
      <div className="daily-progress" aria-label={`已完成 ${session.completed.length} 步，共 4 步`}><span style={{ width: `${session.completed.length / 4 * 100}%` }} /></div>
      <nav className="daily-step-tabs" aria-label="每日练习步骤">{steps.map((item, index) => <button key={item.id} disabled={Boolean(busy)} className={step === index ? 'active' : ''} onClick={() => setStep(index)}><NavIcon name={session.completed.includes(item.id) ? 'check' : item.icon} /><span>{item.title}</span></button>)}</nav>
      <section className="daily-task">
        {step === 0 && <><p className="redesign-eyebrow">先用英文理解，中文按需展开</p><p className="daily-reading">{session.plan.practiceTextEn}</p><p className="muted tiny">AI 简化练习{session.context.source ? ` · 依据 ${session.context.source.title}` : ' · 生活场景示例'}</p><h3>{session.plan.gistQuestionEn}</h3><button className="redesign-text-button" onClick={() => speak(session.plan.practiceTextEn)}><NavIcon name="play" />听练习短文</button><div className="daily-meanings">{session.plan.englishMeanings.map(item => <article key={item.text}><strong>{item.text}</strong><p>{item.meaningEn}</p><small>{item.exampleEn}</small><button className="redesign-text-button" onClick={() => onCapture({ text: item.text, context: item.exampleEn })}>记进本子</button></article>)}</div><p className="muted tiny">简明英英释义由 AI 生成，可结合原句核对。</p><details><summary>需要一点中文帮助</summary><p>{session.plan.helpZh}</p>{session.context.focus.map(item => <p key={item.id}>{item.text}：{item.meaningZh.join('；') || '可在本子中补充释义'}</p>)}</details></>}
        {step === 1 && <><p className="redesign-eyebrow">听懂后，再模仿节奏和重音</p><p className="daily-reading">{session.context.shadowQuote}</p><div className="practice-actions"><button className="redesign-secondary" onClick={() => speak(session.context.shadowQuote)}><NavIcon name="play" />听这句</button><button className="redesign-primary" onClick={() => onShadow(session.context.shadowQuote)}><NavIcon name="mic" />录音跟读</button></div><p>先慢慢跟读，再试着用自然的节奏说。无需刻意卡住半秒延迟。</p></>}
        {step === 2 && <><h3>{session.plan.retellPromptEn}</h3><p className="muted">不用逐句翻译，用自己会的英文说两三句。</p><VoiceInput active={active && step === 2} disabled={Boolean(busy)} onText={value => change({ ...session, retelling: session.retelling ? session.retelling + ' ' + value : value }, true)} /><textarea aria-label="每日练习复述" value={session.retelling} maxLength={2500} rows={5} onChange={e => change({ ...session, retelling: e.target.value }, true)} placeholder="Speak or write in your own words…" /><button className="redesign-text-button" disabled={!session.retelling.trim()} onClick={() => { setAnswer(session.retelling); setStep(3) }}>带着复述，继续对话 →</button></>}
        {step === 3 && <><p className="redesign-eyebrow">{session.plan.situationZh}</p><div className="practice-chat"><div className="assistant">{session.plan.openingQuestionEn}</div>{session.turns.map((turn, index) => <div key={index} className={turn.role}>{turn.content || '正在接话…'}{turn.content && <div><button className="redesign-text-button" onClick={() => speak(turn.content)}>朗读</button><button className="redesign-text-button" onClick={() => onCapture({ text: turn.content, context: session.plan.situationZh })}>收藏表达</button></div>}</div>)}</div><div className="daily-voice-options"><label><input type="checkbox" checked={voiceSend} onChange={e => setVoiceSend(e.target.checked)} />说完发送</label><label><input type="checkbox" checked={voiceReply} onChange={e => { setVoiceReply(e.target.checked); if (e.target.checked) speak('Ready.') }} />朗读回复</label></div><VoiceInput active={active && step === 3} disabled={Boolean(busy)} onText={value => { setAnswer(value); if (voiceSend) void send(value) }} /><textarea aria-label="每日练习对话" rows={3} value={answer} maxLength={1600} onChange={e => setAnswer(e.target.value)} placeholder="用今天的表达，说说你自己的生活…" /><div className="practice-actions"><button className="redesign-primary" disabled={Boolean(busy) || !answer.trim()} onClick={() => void send()}>{busy === 'chat' ? '正在接话…' : '发送'}</button>{busy === 'chat' && <button className="redesign-secondary" onClick={() => controller.current?.abort()}>停止</button>}</div><details><summary>离开 App 后，也可以这样练</summary><p>{session.plan.selfTalkPromptEn}</p></details></>}
        <button className="redesign-secondary daily-complete" disabled={Boolean(busy)} onClick={() => { const next = { ...session, completed: [...new Set([...session.completed, steps[step].id])] }; void syncProgress(next); setStep(Math.min(step + 1, 3)) }}><NavIcon name="check" />{session.completed.includes(steps[step].id) ? '这一步已完成' : '完成这一步'}</button>
      </section>
      {session.context.source && <details className="daily-origin"><summary>原素材 · {session.context.source.title}</summary><p>{session.context.source.excerpt}</p><button className="redesign-text-button" onClick={() => onOrigin?.(session.context.source?.origin)}>回到素材位置 →</button></details>}
      <section className="daily-reflection"><h3>这组练习感觉怎样？</h3><div>{[['hard', '有点难'], ['right', '刚刚好'], ['easy', '可以更难']].map(([value, label]) => <button className={session.rating === value ? 'chip active' : 'chip'} key={value} onClick={() => change({ ...session, rating: value }, true)}>{label}</button>)}</div><textarea rows={2} aria-label="每日练习反思" value={session.reflection} maxLength={1200} onChange={e => change({ ...session, reflection: e.target.value }, true)} placeholder="今天想带走的一句表达，或仍然卡住的地方（可选）" /><button className="redesign-primary" disabled={Boolean(busy)} onClick={() => void syncProgress()}>{busy === 'save' ? '保存中…' : '保存练习'}</button></section>
    </>}
    {message && <p className="redesign-message" role="status">{message}</p>}
    {!overview && !session && <p className="muted tiny">联网并登录后可生成个性练习。也可切换「跟读一句」或「带词对话」，继续已有练习。</p>}
    {overview?.history.length ? <details className="daily-history"><summary>最近每日练习 · {overview.history.length} 组</summary>{overview.history.map(item => <button key={item.id} disabled={Boolean(busy)} onClick={() => { setBusy('load'); void openSession(item.id).then(() => { setStep(0); setMessage('') }).catch((error: Error) => setMessage(error.message)).finally(() => setBusy('')) }}>{item.date} · {item.title} · {item.completed.length}/4 步</button>)}</details> : null}
  </div>
}
