# 朝花夕拾 AI伴侣网站

这是一个可直接部署到 Vercel 的 `Next.js + Serverless API` AI 聊天网站，当前主打：

- 游客模式聊天，记录保存在浏览器 `localStorage`
- Supabase 登录与云端同步
- 多角色聊天
- AI伴侣模式（支持 AI女友 / AI男友）
- 微信聊天记录导入为长期记忆
- 图片上传理解

## 当前能力

- `POST /api/chat`：普通流式聊天
- `POST /api/import-chat-record`：导入 `txt / json / csv` 聊天记录并生成记忆摘要
- `POST /api/image-chat`：图片理解聊天
- 聊天页支持图片预览气泡
- 设置页支持记忆管理
- 已登录用户将聊天记录与记忆同步到 Supabase

## 关键目录

- [app/page.jsx](/E:/微信小程序/codex/ex-skill/app/page.jsx:1)
- [app/api/chat/route.js](/E:/微信小程序/codex/ex-skill/app/api/chat/route.js:1)
- [app/api/import-chat-record/route.js](/E:/微信小程序/codex/ex-skill/app/api/import-chat-record/route.js:1)
- [app/api/image-chat/route.js](/E:/微信小程序/codex/ex-skill/app/api/image-chat/route.js:1)
- [components/chat-app.jsx](/E:/微信小程序/codex/ex-skill/components/chat-app.jsx:1)
- [components/memory-manager.jsx](/E:/微信小程序/codex/ex-skill/components/memory-manager.jsx:1)
- [components/message-input.jsx](/E:/微信小程序/codex/ex-skill/components/message-input.jsx:1)
- [lib/chat/roles.js](/E:/微信小程序/codex/ex-skill/lib/chat/roles.js:1)
- [lib/memory/profile.js](/E:/微信小程序/codex/ex-skill/lib/memory/profile.js:1)
- [lib/storage/chat-local.js](/E:/微信小程序/codex/ex-skill/lib/storage/chat-local.js:1)
- [lib/storage/user-memory.js](/E:/微信小程序/codex/ex-skill/lib/storage/user-memory.js:1)
- [lib/supabase/chat-cloud.js](/E:/微信小程序/codex/ex-skill/lib/supabase/chat-cloud.js:1)
- [lib/supabase/user-memory-cloud.js](/E:/微信小程序/codex/ex-skill/lib/supabase/user-memory-cloud.js:1)
- [supabase/schema.sql](/E:/微信小程序/codex/ex-skill/supabase/schema.sql:1)

## 环境变量

在项目根目录创建 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=chat-images
NEXT_PUBLIC_APP_API_BASE_URL=
AI_API_KEY=
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_VISION_MODEL=
```

说明：

- `AI_MODEL`：普通文本聊天模型
- `AI_VISION_MODEL`：支持图片理解的多模态模型；如果不配置，前端仍可上传图片，但发送时会提示“当前模型暂不支持图片理解”
- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`：登录用户图片附件保存到 Supabase Storage 时使用的 bucket，默认 `chat-images`
- `NEXT_PUBLIC_APP_API_BASE_URL`：前端请求 API 的可选基地址。生产环境通常留空，默认使用同源 `/api/*`；不要在 Vercel 配成 `localhost`、`127.0.0.1` 或 `http` 地址，否则手机 Safari 会无法访问或被 HTTPS 页面拦截。

示例文件：

- [.env.local.example](/E:/微信小程序/codex/ex-skill/.env.local.example:1)

## 微信聊天记录导入

支持格式：

- `.txt`
- `.json`
- `.csv`

前端入口：

- 聊天页中的“记忆管理”
- 点击“导入微信聊天记录”

导入流程：

1. 用户上传聊天记录文件
2. 服务端解析文本
3. 调用 AI 生成结构化记忆
4. 默认只保存总结后的 `memory_summary` 与各类提炼字段，不长期保留原始聊天记录

当前会提取：

- 用户常用称呼
- 用户说话风格
- 常聊话题
- 情绪倾向
- 生活习惯
- 重要人物 / 事件
- 喜欢和不喜欢的东西

### 如何导出微信聊天记录

这个项目本身不直接读取微信数据库，通常建议先把聊天内容整理为以下任一格式后再导入：

- 手动复制聊天文本并保存为 `.txt`
- 用你现有的导出工具整理成 `.json`
- 把聊天行整理成 `时间,说话人,内容` 的 `.csv`

建议先做一次脱敏：

- 删除身份证号、手机号、住址、银行卡等敏感内容
- 删除你无权上传的第三方隐私信息

## 图片理解

聊天输入框旁提供图片上传按钮，支持：

- `jpg`
- `png`
- `webp`

行为说明：

- 上传后会在发送前预览
- 发送后用户图片会显示在聊天气泡中
- 如果已配置 `AI_VISION_MODEL`，会走 `/api/image-chat`
- 如果未配置，会提示“当前模型暂不支持图片理解”

## 记忆管理

当前页面支持：

- 查看 AI 当前记住了什么
- 手动编辑记忆
- 删除单条记忆
- 清空所有记忆

存储规则：

- 未登录：记忆保存在 `localStorage`
- 已登录：记忆保存在 Supabase `user_memories`
- 已登录且发送图片：附件会保存到 Supabase Storage，消息正文和附件元数据保存到 `messages`

## AI伴侣实时感知系统

AI伴侣模式会在服务端按 `Asia/Shanghai` 获取当前真实时间，并把日期、时间、星期、时间段和陪伴建议注入本轮 system prompt。用户问“现在几点了”“今天周几”“今天几号”时，AI 必须按真实时间回答；普通聊天时不应每条都播报时间，只在早安、午饭、晚间放松、深夜休息等场景自然关心。

建议回归测试：

- 用户问：`现在几点了？`，应准确回答当前上海时间。
- 用户问：`今天周几？`，应准确回答星期几。
- 用户说：`我好累`，应结合当前时间自然安慰，不机械报时。
- 深夜聊天时，应温柔提醒早点休息。
- 普通聊天时，不要每条都主动报日期或时间。

## Supabase 表

业务表：

- `conversations`
- `messages`
- `user_memories`
- `relationship_stories`

### user_memories

- `id uuid primary key`
- `user_id uuid`
- `memory_type text`
- `content text`
- `source text`
- `created_at timestamp`
- `updated_at timestamp`

执行 SQL：

- [supabase/schema.sql](/E:/微信小程序/codex/ex-skill/supabase/schema.sql:1)

它现在会同时创建：

- 聊天表
- 记忆表
- 关系剧情档案表
- 消息附件字段
- 消息情绪字段
- Storage bucket 与访问策略
- 索引
- 授权
- RLS 策略

如果你的 Supabase 是更早建的库，直接重新执行一次 [supabase/schema.sql](/E:/微信小程序/codex/ex-skill/supabase/schema.sql:1) 即可。这个文件已经尽量按幂等方式写好了，会自动补：

- `public.relationship_stories`
- `public.messages.attachments`
- `public.messages.emotion`

## 本地运行

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:3000
```

## 部署到 Vercel

1. 上传到 GitHub
2. 导入 Vercel
3. 配置环境变量
4. 部署

至少需要：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_API_BASE_URL` 留空，除非你有独立 HTTPS API 域名
- `AI_API_KEY`
- `AI_MODEL`

如果需要图片理解，再额外配置：

- `AI_VISION_MODEL`

如果需要登录后跨设备同步图片，再额外确认：

- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`

部署后建议用手机 Safari 访问正式域名。如果页面提示服务暂不可用但主界面能进入，优先检查 Vercel 环境变量里的 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`AI_VISION_MODEL`；如果停留在登录或云同步提示，检查 Supabase URL/Anon Key、数据库 schema 和 Storage policy。

## 隐私提示

- 聊天记录可能包含隐私，请确认你有权上传
- 建议先删除敏感内容后再导入
- 默认只保存总结后的记忆，不长期暴露原始聊天记录
- AI伴侣会自然参考这些记忆，但不会机械复述隐私内容
