# 阅读、等级与即时反馈

## 私人素材与阅读

素材库提供 A1、A2、B1、B2、C1、C2 与待评估筛选。文本估算使用句长和长词比例，只用于整理，不是 CEFR 认证；节目类型参考不代表整集经过听评。用户可调整等级，原著不沿用下载文件夹里未经验证的 A1 标签。

批量选择音视频、同名 TXT/SRT/VTT 和 EPUB 后，先显示配对及等级预览。已有文稿会清理字幕序号、时间行或已知网页杂文，再生成练习；没有文稿的音视频默认进入本机队列。SHA-256 用于当前账号内的重复检测。私人原件、全文与练习不进入 Git 或公开资源目录。

EPUB 以章节顺序解析成安全纯文本，提供目录、字号、阅读位置、选词查词、记录与复述。不执行书中的脚本，不支持 DRM 或固定版式的完整排版。首次打开后缓存正文，离线仍可阅读和记录；缓存按登录账号隔离。阅读位置联网时同步。收藏在 `Entry.enrichment.origin` 保留素材与章节/段落定位，可从本子的「回到原文」打开出处。

用户修复后，22 本 EPUB 全部通过 ZIP/CRC 与章节解析检查。原先有效的 15 本哈希保持一致，只补入另外 7 本；已有阅读位置和收藏保留。58 段音频中 30 份已有配套正文，另外 28 集已在本机 GPU 完成转写，生成 15,659 个时间片段（合计约 14.21 小时）。转写及容器检查不等于全文经过人工校对。

## 本机转写

助手复用已安装字幕工具的 Python 环境、`asr_worker` 加载器和本地模型。FFmpeg 转成 PCM 后识别，避免 PyAV 版本差异；CUDA 不可用时明确回退 CPU，不下载模型。只向 NAS 发出 HTTPS 请求，不开放电脑端口。账号密码启动时私密输入，仅保留在进程内。

在项目目录启动，替换工具目录占位符：

```powershell
& '<字幕工具目录>/.venv/Scripts/python.exe' scripts/local-transcriber.py --tool-root '<字幕工具目录>' --model small
```

助手领取自己账号的队列、读取签名音频，生成原文和时间片段并回传 NAS，自动更新练习。电脑休眠或助手未运行时任务等待，Ctrl+C 停止。任务领取有两小时租期，NAS 重启或租期过期后可以重新领取。超长素材应先拆分；本轮没有实时语音评分或全双工语音聊天。

仅离线验证，不登录 NAS：

```powershell
& '<字幕工具目录>/.venv/Scripts/python.exe' scripts/local-transcriber.py --tool-root '<字幕工具目录>' --model small --file '<音频>' --output work/asr-check.json
```

## DeepSeek

使用官方 `https://api.deepseek.com/chat/completions` 的 `deepseek-flash`，关闭深度思考、限制回答长度，并以 SSE 逐段显示。只发送当前表达和最近八轮文字，不自动发送整本书、音视频或笔记库。可以中止，失败时保留输入；主动发送后获得简短回应、一处必要纠正和追问。

DeepSeek 与可选 OpenAI 转写密钥分别以 AES-GCM 加密保存在 NAS 私人配置中，浏览器只查询配置状态。用户已授权在 NAS 内部沿用家庭档案既有 DeepSeek 密钥，密钥不通过聊天、源码或公开资源传递。

参考：[DeepSeek 官方接口](https://api-docs.deepseek.com/api/create-chat-completion/)、[fflate 容器解析依赖](https://github.com/101arrowz/fflate)。

## 批次导入

`scripts/prepare-learning-library.py <原始目录> <忽略的工作输出目录>` 生成派生文稿、章节、哈希清单和原件副本，不改源文件。停止后端并完整备份 `data/` 后运行：

```sh
EC_DATA_DIR="$APP_ROOT/data" EC_PID_FILE="$APP_ROOT/logs/ec.pid" \
  node "$APP_ROOT/server/import-materials.mjs" /private/batch/manifest.json --offline
```

导入器要求当前恰有一个账号，校验全部文件路径、符号链接边界与哈希后再更新索引；重复批次会跳过相同内容。程序回退保留新增素材与用户数据。

## 素材浏览与时间字幕

素材以双列/多列紧凑卡片浏览，每页 12 份，顶部提供搜索、等级、听力/阅读和翻页控制，内置课程默认收起。播放器支持视频与音频、播放位置保存、导入 SRT/VTT 时间轴、点击句子定位并播放、当前句高亮和单句循环。纯文本不伪造时间轴，需通过本机转写生成定位字幕。

本机助手支持重复的 `--cuda-lib <已有库目录>` 参数，仅影响助手进程，便于使用已安装 pyVideoTrans 等软件的 CUDA 库；不改变其他软件或全局环境。GPU 样本已验证，CPU 回退仍保留。


## 完整课程训练

走遍美国 26 集以登录后的私人视频素材导入 NAS，与用户上传的音视频使用同一播放器，不依赖 YouTube iframe。每集有本机 Whisper 原文、准确时间片段、点击定位、单句循环、播放位置、收藏回到出处，以及可保存到 NAS 的时间笔记。手机隐藏重复的素材库大标题，提供重点/笔记快捷定位；长原文在独立区域滚动。

DeepSeek 从指定素材的原文生成简短概述、学习目标、重点用法和理解练习。每个重点必须包含可在原文中核对的引用；时间由服务器从对应片段读取，不接受模型编造的秒数。自动文本可能有识别或讲解错误，可以结合原句核对。新上传素材完成文稿后，如已配置 DeepSeek，会自动整理重点；失败保留原文与基础练习，可重试。电子书不自动整本发送。素材列表只加载摘要，打开时才读取全文和笔记。

课程清单仅包含元数据。视频、全文、笔记、AI 输出与导入清单保存在私人存储，不进入源码或公开静态目录。

离线批量转写支持 `--batch-manifest <私人清单> --output <私人结果目录>`，已完成的哈希结果可续跑。`scripts/prepare-course-training.py <课程元数据> <私人视频目录>` 校验全部 26 集的原件哈希与时间轴，生成私人导入清单。`nas/import-transcripts.mjs <28集结果目录> --offline` 必须停写后运行；整批校验通过后才更新索引，保留素材 ID、原文件、笔记和播放位置。

针对本轮新增行为运行 `node scripts/test-study-guide.mjs`（拒绝无依据引用与模型时间）和 `node scripts/test-transcript-import.mjs`（完整 28 集、失败不写入、原数据保留）。
