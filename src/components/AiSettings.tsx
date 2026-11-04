import { useEffect, useRef, useState } from 'react'
import { chooseAiProvider, deleteAiKey, getAiStatus, getAiModels, saveAiSettings, testAiConnection } from '../lib/media'
import type { AiProvider, AiServiceSettings, AiStatus } from '../lib/media'

export function AiSettings({ loggedIn }: { loggedIn: boolean }) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [draft, setDraft] = useState<AiServiceSettings | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState(false)
  const feedback = useRef<HTMLDivElement>(null)
  const saved = status?.services[provider]
  const dirty = Boolean(key || (draft && saved && ['baseUrl', 'model', 'thinking', 'reasoningEffort', 'networkMode'].some(field => draft[field as keyof AiServiceSettings] !== saved[field as keyof AiServiceSettings])))
  const addressChanged = Boolean(draft && saved?.configured && draft.baseUrl.replace(/\/+$/, '') !== saved.baseUrl)
  useEffect(() => { if (message) feedback.current?.scrollIntoView({ block: 'nearest' }) }, [message])

  useEffect(() => {
    let cancelled = false
    setProvider('gemini'); setStatus(null); setDraft(null); setKey(''); setMessage('')
    if (loggedIn) {
      setBusy('load')
      void getAiStatus().then(value => { if (!cancelled) { setStatus(value); setDraft(value.services.gemini) } }).catch((e: Error) => { if (!cancelled) { setMessage(e.message); setError(true) } }).finally(() => { if (!cancelled) setBusy('') })
    }
    return () => { cancelled = true }
  }, [loggedIn])

  async function action(name: string, work: () => Promise<string>) {
    if (busy) return
    setBusy(name); setMessage(''); setError(false)
    try { setMessage(await work()) } catch (e) { setMessage((e as Error).message); setError(true) }
    finally { setBusy('') }
  }
  function select(next: AiProvider) {
    if (busy || next === provider) return
    setModels([]); setProvider(next); setDraft(status?.services[next] || null); setKey(''); setMessage(''); setError(false)
  }
  async function reload() {
    const value = await getAiStatus()
    setStatus(value)
    if (!dirty) setDraft(value.services[provider])
    return value.services[provider].configured ? '已读取：密钥已保存' : '已读取：尚未保存密钥'
  }
  return <section className="panel ai-settings">
    <div className="ai-settings-heading"><h2>AI 释义与对话</h2>{status && <span className="muted tiny">当前：{status.assistantProvider === 'gemini' ? 'Gemini' : 'DeepSeek'}</span>}</div>
    {!loggedIn ? <p className="muted">登录 NAS 账号后可以配置。</p> : <>
      <div className="ai-settings-tabs" role="group" aria-label="配置 AI 服务">{(['deepseek', 'gemini'] as const).map(name => <button key={name} type="button" className={provider === name ? 'chip active' : 'chip'} aria-pressed={provider === name} disabled={Boolean(busy)} onClick={() => select(name)}>{name === 'gemini' ? 'Gemini' : 'DeepSeek'}</button>)}</div>
      {draft && <fieldset disabled={Boolean(busy)} className="ai-settings-fields">
        <label className="field"><span>接口地址</span><input type="url" aria-label="AI 接口地址" value={draft.baseUrl} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} spellCheck={false} autoCapitalize="none" /></label>
        <label className="field"><span>模型 ID</span><input list="ai-model-options" aria-label="AI 模型 ID" value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} spellCheck={false} autoCapitalize="none" /><datalist id="ai-model-options">{models.map(model => <option key={model} value={model} />)}</datalist><button className="redesign-text-button" type="button" disabled={!saved?.configured || dirty} onClick={() => void action('models', async () => { const value = await getAiModels(provider); setModels(value.models); return `已读取 ${value.models.length} 个模型，可在模型 ID 中选择；具体调用权限以测试为准` })}>读取可用模型</button></label>
        <label className="field"><span>连接方式</span><select aria-label="AI 连接方式" value={draft.networkMode} onChange={e => setDraft({ ...draft, networkMode: e.target.value as AiServiceSettings['networkMode'] })}><option value="auto">自动选择</option><option value="direct">NAS 直接连接</option><option value="proxy">通过 NAS 出网代理</option></select><small className="muted">{saved?.proxyAvailable ? `代理已配置：${saved.proxyLabel}` : 'NAS 尚未配置代理；电脑代理不会自动应用到 NAS'}</small></label>
        <label className="field"><span>回复方式</span>{provider === 'gemini' ? <select aria-label="AI 回复方式" value={draft.reasoningEffort} onChange={e => setDraft({ ...draft, reasoningEffort: e.target.value as AiServiceSettings['reasoningEffort'] })}><option value="default">模型默认</option><option value="low">简短思考</option><option value="medium">适中思考</option><option value="high">深入思考</option></select> : <select aria-label="AI 回复方式" value={draft.thinking} onChange={e => setDraft({ ...draft, thinking: e.target.value as AiServiceSettings['thinking'] })}><option value="disabled">快速回复</option><option value="enabled">深度思考</option><option value="default">模型默认</option></select>}</label>
        <label className="field"><span>API 密钥 <small className="muted">{saved?.configured ? '已加密保存' : '尚未保存'}</small></span><input type="password" aria-label={`${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API 密钥`} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={key} placeholder={saved?.configured ? '留空保留已有密钥' : '粘贴完整密钥'} onChange={e => setKey(e.target.value)} /></label>
        {addressChanged && <p className="muted tiny">接口地址已更改，请重新填写用于该服务的密钥。</p>}
        <div className="ai-settings-actions">
          <button className="primary" type="button" onClick={() => void action('save', async () => { const value = await saveAiSettings(provider, draft, key); setStatus(current => current ? { ...current, services: { ...current.services, [provider]: { ...current.services[provider], ...value.settings } } } : current); setDraft(value.settings); setKey(''); return value.settings.configured ? '设置和密钥已加密保存，尚未验证调用。' : '设置已保存，添加密钥后可测试连接。' })}>{busy === 'save' ? '保存中…' : '保存设置'}</button>
          <button className="ghost" type="button" disabled={!saved?.configured || dirty} onClick={() => void action('test', async () => { const value = await testAiConnection(provider); return `连接成功 · ${value.result.model} · ${(value.result.latencyMs / 1000).toFixed(1)} 秒` })}>{busy === 'test' ? '测试中…' : '测试连接'}</button>
          <button className="ghost" type="button" disabled={!saved?.configured || dirty || status?.assistantProvider === provider} onClick={() => void action('choose', async () => { await chooseAiProvider(provider); setStatus(current => current ? { ...current, assistantProvider: provider } : current); return '已设为当前 AI 服务' })}>设为当前服务</button>
        </div>
        <div className="ai-settings-secondary"><button className="redesign-text-button" type="button" onClick={() => { setDraft(status?.presets[provider] || null); setMessage('已填入预设，保存后生效'); setError(false) }}>恢复预设</button>{saved?.configured && <button className="redesign-text-button" type="button" onClick={() => void action('remove', async () => { await deleteAiKey(provider); setStatus(current => current ? { ...current, services: { ...current.services, [provider]: { ...current.services[provider], configured: false } } } : current); setKey(''); return '密钥已移除' })}>移除密钥</button>}</div>
      </fieldset>}
      <div ref={feedback} className={`ai-settings-feedback${error ? ' error' : ''}`} role="status" aria-live="polite">{busy === 'load' ? '正在读取设置…' : message}</div>
      <button className="redesign-text-button" type="button" disabled={Boolean(busy)} onClick={() => void action('load', reload)}>重新读取状态</button>
      {provider === 'gemini' && <p className="muted tiny"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">创建 Gemini 密钥</a> · <a href="https://aistudio.google.com/docs/google-ai-plans" target="_blank" rel="noreferrer">订阅与 API 用量分开管理</a></p>}
    </>}
  </section>
}
