import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { exportEntriesJson } from '../lib/export'
import {
  getCurrentUser,
  getLastSyncAt,
  isSyncConfigured,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  syncNow,
} from '../lib/sync'

export function SettingsView() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const configured = isSyncConfigured()

  async function refresh() {
    setUser(await getCurrentUser())
    setLastSync(await getLastSyncAt())
  }

  useEffect(() => {
    void refresh()
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

      <section className="panel">
        <h2>云同步与备份</h2>
        {!configured ? (
          <p className="muted">
            云端尚未接入。按引导配置 Supabase + Vercel 后，手机与 Mac App 可共用同一本词库。
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
                        .then(() =>
                          setMessage('注册成功。若开启了邮箱确认，请先查收邮件再登录。'),
                        )
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
        <h2>导出备份</h2>
        <p className="muted">额外保一份 JSON 到手机/电脑，更稳妥。</p>
        <button type="button" className="primary" onClick={() => void exportEntriesJson()}>
          导出我的本子
        </button>
      </section>
    </div>
  )
}
