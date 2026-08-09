# 英语剪贴本 · English Clip

本地优先的英语词句剪贴工具：手机加到主屏幕随时记，Mac 桌面版也能用；同一邮箱登录后经 Supabase 同步。

- **线上地址：** https://english-clip.vercel.app  
- **给 AI 改代码：** 见 [AGENTS.md](./AGENTS.md)

## 功能

- 快速记录单词 / 短语 / 句子（语境、笔记可选）
- 离线常用词库搜索 + 自动补全（音标 / 释义 / 频率）
- 首页「许久未见」轻复习（生疏 / 见过 / 能用）
- 云同步（Supabase）+ JSON 导出备份
- PWA 主屏幕 / Electron macOS 桌面版

## 开发

```bash
npm install
cp .env.example .env   # 填写 Supabase
npm run dev            # 网页
npm run app            # 桌面开发窗口
```

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地网页 |
| `npm run app` | Electron 开发 |
| `npm run build` | 构建网页产物 |
| `npm run dist:mac` | 打包 macOS `.app` / `.dmg` |
| `npm run build:lexicon` | 重建离线词库 |

## 云端（Supabase）

1. 新建 Supabase 项目  
2. SQL Editor 执行 [`supabase/schema.sql`](./supabase/schema.sql)  
3. `.env` 填写：

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

4. Authentication → Providers：开启 Email（个人用可关掉 Confirm email）  
5. Authentication → URL Configuration：
   - Site URL：`https://english-clip.vercel.app`
   - Redirect URLs：`https://english-clip.vercel.app/**`

> 切勿把 `service_role` / `sb_secret_*` 写进前端或提交到 Git。

## 部署

Vercel 项目：`english-clip`。推送到 `main` 或执行：

```bash
npm run build
npx vercel --prod
```

需在 Vercel 配置同样的 `VITE_SUPABASE_*`。

## 手机安装

- iPhone：Safari 打开 https://english-clip.vercel.app → 分享 → 添加到主屏幕  
- Android：Chrome 打开 → 菜单 → 添加到主屏幕 / 安装应用  

手机与 Mac App 使用**同一邮箱**登录即可互通数据。
