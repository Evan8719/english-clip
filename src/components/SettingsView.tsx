import { AppearanceSettings } from './AppearanceSettings'
import { useEffect, useState } from 'react'
import { NavIcon } from './NavIcon'
import { AiSettings } from './AiSettings'
import type { SyncUser as User } from '../lib/sync'
import { aiKeyConfigured, deleteAiKey, saveAiKey } from '../lib/media'
import { exportEntriesJson, exportEntriesMarkdown, exportLegacyEntriesJson } from '../lib/export'
import { listLegacyEntries } from '../db/entries'
import { readSession, observeSession } from '../lib/session'
import {
  addCategory,
  DEFAULT_CATEGORIES,
  listCategories,
  removeCategory,
} from '../lib/categories'
import {
  getCurrentUser,
  getLastSyncAt,
  isSyncConfigured,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  syncNow,
} from '../lib/sync'

export function SettingsView({ entryCount }: { entryCount: number }) {
  const [user, setUser] = useState<User | null>(() => readSession().user)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [aiKey, setAiKey] = useState('')
  const [aiConfigured, setAiConfigured] = useState(false)
  const [legacyCount, setLegacyCount] = useState(0)
  const [exportMessage, setExportMessage] = useState('')
  const configured = isSyncConfigured()

  async function refresh() {
    const current = await getCurrentUser()
    setUser(current)
    setAiConfigured(current ? await aiKeyConfigured().catch(() => false) : false)
    setLastSync(await getLastSyncAt())
    setCategories(await listCategories())
  }

  useEffect(() => {
    void refresh()
    let active = true
    void listLegacyEntries().then(items => { if (active) setLegacyCount(items.length) }).catch(() => undefined)
    const stop = observeSession(() => {
      setUser(readSession().user)
      setEmail('')
      setPassword('')
      setAiKey('')
      setAiConfigured(false)
      setLastSync(null)
    })
    return () => { active = false; stop() }
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <h1>设置</h1>
        <p className="lede">手机记、电脑看——同一邮箱登录即可互通。</p>
      </header>

      <section className="panel">
        <h2>安装到手机主屏幕</h2>
        <p className="muted">
          用 Safari 打开线上地址 → 分享 →「添加到主屏幕」。之后点图标就能用，和「小积分」一样。
        </p>
      </section>

      <AppearanceSettings />
      <AiSettings loggedIn={Boolean(user)} />
      <section className="panel">
        <h2>电脑本地转写</h2><p className="muted">素材内点击「本机转写」，再在电脑运行项目的本地转写助手。助手复用已安装的字幕工具模型，只向 NAS 回传文稿。电脑休眠或助手未启动时，任务会等待。</p><p className="muted tiny">启动命令见 nas/README.md 的本机转写章节。助手只需登录自己的 NAS 账号，不需要对外开放电脑端口。</p>
      </section>
      <section className="panel">
        <h2>可选的在线音视频转写</h2>
        <p className="muted">上传的文件保存在 NAS。你主动发起转写时，NAS 会把提取的音频发送到 OpenAI；原文件、原文和练习继续保存在 NAS。</p>
        <p className="muted">{aiConfigured ? '转写 API 密钥已配置。密钥只保存在 NAS，不会回显到浏览器。' : '尚未配置 OpenAI API 密钥。已有原文的素材仍可直接生成练习。'}</p>
        {user && <div className="row"><input type="password" autoComplete="off" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder="输入 OpenAI API 密钥" aria-label="OpenAI API 密钥" /><button type="button" className="primary" disabled={busy || !aiKey.trim()} onClick={() => { setBusy(true); void saveAiKey(aiKey.trim()).then(() => { setAiKey(''); setAiConfigured(true); setMessage('转写密钥已保存到 NAS') }).catch((error: Error) => setMessage(error.message)).finally(() => setBusy(false)) }}>保存密钥</button>{aiConfigured && <button type="button" className="ghost" onClick={() => { void deleteAiKey().then(() => { setAiConfigured(false); setMessage('已移除转写密钥') }).catch((error: Error) => setMessage(error.message)) }}>移除</button>}</div>}
        {!user && <p className="muted tiny">登录 NAS 账号后可以配置。</p>}
      </section>

      <section className="panel">
        <h2>云同步与备份</h2>
        {!configured ? (
          <p className="muted">
            当前设备暂时无法连接 NAS 同步服务。本地记录仍可正常使用；恢复连接后再登录同步。
          </p>
        ) : (
          <>
            <p className="muted">
              {user
                ? `已登录：${user.email ?? '已登录'}`
                : '未登录。手机和电脑请用同一个邮箱。'}
              {lastSync ? ` · 上次同步 ${new Date(lastSync).toLocaleString()}` : ''}
            </p>

            {!user && (
              <div className="auth-fields">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="密码（至少 6 位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !email || password.length < 6}
                    onClick={() => {
                      setBusy(true)
                      void signInWithEmail(email, password)
                        .then(() => syncNow())
                        .then((r) => {
                          setMessage(r.ok ? '登录并同步成功' : r.message)
                          return refresh()
                        })
                        .catch((e: Error) => setMessage(e.message))
                        .finally(() => setBusy(false))
                    }}
                  >
                    登录并同步
                  </button>
                  <button
                    type="button"
                    className="chip"
                    disabled={busy || !email || password.length < 6}
                    onClick={() => {
                      setBusy(true)
                      void signUpWithEmail(email, password)
                        .then(() => syncNow())
                        .then((r) => {
                          setMessage(r.ok ? '注册成功，本子已同步' : `注册成功（${r.message}）`)
                          return refresh()
                        })
                        .catch((e: Error) => setMessage(e.message))
                        .finally(() => setBusy(false))
                    }}
                  >
                    注册
                  </button>
                </div>
              </div>
            )}

            {user && (
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void syncNow()
                      .then((r) => {
                        setMessage(r.message)
                        return refresh()
                      })
                      .finally(() => setBusy(false))
                  }}
                >
                  立即同步
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    void signOut().then(refresh)
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          </>
        )}
        {message && <p className="status">{message}</p>}
      </section>

      <section className="panel">
        <h2>介质分类</h2>
        <p className="muted">
          默认：影视剧 / YouTube / 播客 / 阅读 / 其他。可加自定义；点 × 仅能删自定义项。
        </p>
        <div className="kind-row">
          {categories.map((c) => {
            const core = (DEFAULT_CATEGORIES as readonly string[]).includes(c)
            return (
              <button
                key={c}
                type="button"
                className="chip"
                onClick={() => {
                  if (core) {
                    setMessage('默认介质分类不能删除')
                    return
                  }
                  void removeCategory(c).then((list) => {
                    setCategories(list)
                    setMessage(`已删除分类：${c}`)
                  })
                }}
              >
                {c}
                {core ? '' : ' ×'}
              </button>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: '0.7rem' }}>
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="自定义，如：课堂 / 工作"
          />
          <button
            type="button"
            className="primary"
            onClick={() => {
              const name = newCategory.trim()
              if (!name) return
              void addCategory(name).then((list) => {
                setCategories(list)
                setNewCategory('')
                setMessage(`已添加分类：${name}`)
              })
            }}
          >
            添加分类
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>导出本子</h2>
        <p className="muted">{user ? '当前账号' : '本机访客本子'} · {entryCount} 条词句。包含释义、原句、笔记、来源、标签和场景。JSON 额外保留完整的词条数据及复习记录。媒体文件、素材字幕、练习录音和 AI 设置需另行备份。</p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void exportEntriesMarkdown()
                .then(() => setExportMessage('已导出 Markdown'))
                .catch((e: Error) => setExportMessage(e.message || '导出失败'))
                .finally(() => setBusy(false))
            }}
          >
            导出 Markdown
          </button>
          <button
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void exportEntriesJson()
                .then(() => setExportMessage('已导出 JSON 备份'))
                .catch((e: Error) => setExportMessage(e.message || '导出失败'))
                .finally(() => setBusy(false))
            }}
          >
            导出 JSON 备份
          </button>
        </div>
        {!user && legacyCount > 0 && <div>
          <p className="muted">这台设备保留了 {legacyCount} 条旧版记录。可下载原始备份，确认归属后再恢复需要的内容。</p>
          <button type="button" className="chip" disabled={busy} onClick={() => {
            setBusy(true)
            void exportLegacyEntriesJson()
              .then(() => setExportMessage('已导出旧版本机记录'))
              .catch((error: Error) => setExportMessage(error.message || '导出失败'))
              .finally(() => setBusy(false))
          }}>导出旧版本机记录</button>
        </div>}
        {exportMessage && <p role="status">{exportMessage}</p>}
      </section>
      <section className="panel settings-help-links">
        <h2>帮助与素材</h2>
        <a href={`${import.meta.env.BASE_URL}guide.html`} target="_blank" rel="noreferrer"><NavIcon name="book" /><span><strong>使用说明</strong><small>记录、复习、素材和同步</small></span><NavIcon name="next" /></a>
        <a href={`${import.meta.env.BASE_URL}candidates.html`} target="_blank" rel="noreferrer"><NavIcon name="collect" /><span><strong>精选待选清单</strong><small>视频选题与补充流程</small></span><NavIcon name="next" /></a>
      </section>
    </div>
  )
}
