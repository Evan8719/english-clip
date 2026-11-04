# Gemini 网络诊断与可选代理

用户报告测试显示 fetch failed。实际 NAS 直连 Google 官方域名的 TCP/TLS 在 8 秒内超时；电脑现有代理可连通。NAS 无代理进程或相关环境变量，SSH 明确 AllowTcpForwarding no，已停止反向转发尝试，未修改 SSH 访问权限。

用户明确同意临时共享且仅 NAS 使用。实现电脑侧独立小桥接，绑定实际家庭网卡、验证 NAS 来源、只允许 Gemini 的 CONNECT，代理本身仍监听回环地址。不新增防火墙规则，不开放公网，不启用开机启动。实际连接资料仅存 ignored work/ 和 NAS 私有配置。

NAS Node 18 使用零依赖 HTTP CONNECT + TLS，证书和主机名验证保持开启。密钥仍在至目标的 TLS 内，不作为代理明文头发送。新增 per-provider auto/direct/proxy 选择，环境变量 EC_AI_PROXY_URL / EC_AI_PROXY_PROVIDERS / EC_AI_PROXY_LABEL 仅在服务器私有配置。自定义接口的公网 DNS 校验保留，实际连接固定已验证地址，不降级证书安全。

新增模型列表读取，兼容标准 data 与 Google models 两种形状；模型 ID 可手动填写，目录只是候选，是否可调用以实际测试为准。Google 兼容接口还可能以数组返回错误，已兼容并区分 503 繁忙、429 零额度、旧型号不再对新用户开放等，绝不输出上游原始响应中的密钥或私人细节。

真实验证：经专用桥接读取官方模型目录为 200；当前 gemini-3.8-flash 生成请求返回 Google 503 高需求。测试目录中的旧型号确认新用户不可用；另一当前文字模型 gemini-4-argon 返回免费 API 项目额度 0。未换密钥、项目或账号绕过额度，未修改付费设置、用户模型或当前服务，也未声称生成成功。

本地代理边界及模型/错误分类、隔离 API/每日练习回归通过；NAS 独立 TLS 测试校验证书成功与拒绝未信任证书通过，密钥不出现在代理 CONNECT 头；电脑缺少 OpenSSL 的对应 TLS 子测试明确跳过，不冒充通过。手机浏览器模拟提供方验证连接方式、动态模型候选、就地提示与超时恢复。正式发布另记 release 记录。
