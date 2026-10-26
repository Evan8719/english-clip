# 英语剪贴本 · English Clip

本地优先的英语词句剪贴工具：手机加到主屏幕随时记，Mac 桌面版也能用；同一邮箱登录后经自建 NAS 后端同步。

- **正式地址：** https://clip.evenhoo.top:8443/
- **给 AI 改代码：** 见 [AGENTS.md](./AGENTS.md)
- **修改、Git 同步和发布流程：** 见 [docs/WORKFLOW.md](./docs/WORKFLOW.md)
- **NAS 架构与接口：** 见 [nas/README.md](./nas/README.md)

## 功能

- 快速记录单词 / 短语 / 句子（语境、笔记可选）
- 离线常用词库搜索 + 自动补全（音标 / 释义 / 频率）
- 首页「许久未见」轻复习（生疏 / 见过 / 能用）
- NAS 跨设备同步 + JSON 导入导出备份
- PWA 主屏幕 / Electron macOS 桌面版

## 开发

```bash
npm ci --ignore-scripts --no-audit --no-fund
cp .env.example .env   # 同源部署保持 VITE_API_BASE 为空
npm run dev            # 网页
npm run app            # 桌面开发窗口
```

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地网页 |
| `npm run app` | Electron 开发 |
| `npm run build` | 构建网页产物 |
| `npm run build:web` | 使用现有词库构建，不触发词库/图标重建 |
| `npm run dist:mac` | 打包 macOS `.app` / `.dmg` |
| `npm run build:lexicon` | 重建离线词库 |

## 同步与部署

正式版本运行在 NAS，由 `nas/server.mjs` 同时提供静态网页和 `/api/*`。浏览器 IndexedDB 保留本地词条，NAS 负责跨设备同步。当前不依赖 Supabase；`supabase/schema.sql` 仅保留为旧版历史。

NAS 上保留的 `src-build/` 是构建源码副本，运行目录为 `server/` 和 `web/`。源码必须先纳入 Git 并同步 GitHub，正式发布按 [工作流程](./docs/WORKFLOW.md) 进行；Git 推送与 NAS 发布是两个独立步骤。

在其他来源运行前端预览时，可将 `VITE_API_BASE` 设为正式 NAS 地址；常规开发应使用隔离的本地后端和测试数据。实际配置、用户数据及密钥不进入 Git。

## 手机安装

- iPhone：Safari 打开 https://clip.evenhoo.top:8443/ → 分享 → 添加到主屏幕
- Android：Chrome 打开同一地址 → 菜单 → 添加到主屏幕 / 安装应用

手机与 Mac App 使用**同一邮箱**登录即可互通数据。
