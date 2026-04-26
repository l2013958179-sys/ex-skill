import { useEffect, useState, useTransition } from "react";

const sourceTypeOptions = [
  { value: "wechat", label: "微信导出" },
  { value: "imessage", label: "iMessage" },
  { value: "sms", label: "短信" },
  { value: "social", label: "社交媒体" },
  { value: "text", label: "纯文本 / 文本文档" },
];

const socialPlatforms = [
  { value: "weibo", label: "微博" },
  { value: "douban", label: "豆瓣" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "instagram", label: "Instagram" },
  { value: "text", label: "通用文本" },
];

const defaultForm = {
  name: "",
  basicInfo: "",
  personalityProfile: "",
  targetName: "",
  sourceType: "wechat",
  socialPlatform: "text",
  rawText: "",
};

function ResultCard({ title, content }) {
  return (
    <section className="result-card">
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      <pre>{content || "尚未生成"}</pre>
    </section>
  );
}

function App() {
  const [form, setForm] = useState(defaultForm);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [exes, setExes] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isChatting, startChatting] = useTransition();

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => null);

    fetch("/api/exes")
      .then((res) => res.json())
      .then(setExes)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!selectedSlug && exes.length > 0) {
      setSelectedSlug(exes[0].slug);
    }
  }, [exes, selectedSlug]);

  const activeSlug = result?.slug || selectedSlug;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setError("");

    startGenerating(async () => {
      try {
        const payload = new FormData();
        payload.append("name", form.name);
        payload.append("basic_info", form.basicInfo);
        payload.append("personality_profile", form.personalityProfile);
        payload.append("target_name", form.targetName || form.name);
        payload.append("source_type", form.sourceType);
        payload.append("social_platform", form.socialPlatform);
        payload.append("raw_text", form.rawText);
        selectedFiles.forEach((file) => payload.append("files", file));

        const response = await fetch("/api/generate", {
          method: "POST",
          body: payload,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "生成失败");
        }

        setResult(data);
        setSelectedSlug(data.slug);
        setExes((current) => {
          const exists = current.find((item) => item.slug === data.slug);
          if (exists) {
            return current;
          }
          return [
            {
              slug: data.slug,
              name: data.name,
              identity: data.meta?.impression || "",
              version: data.meta?.version || "v1",
              updated_at: data.meta?.updated_at || "",
              corrections_count: data.meta?.corrections_count || 0,
            },
            ...current,
          ];
        });
        setChatHistory([]);
      } catch (generationError) {
        setError(generationError.message);
      }
    });
  }

  async function handleChat(event) {
    event.preventDefault();
    if (!chatMessage.trim() || !activeSlug) {
      return;
    }

    const sendingMessage = chatMessage.trim();
    const nextHistory = [...chatHistory, { role: "user", content: sendingMessage }];
    setChatHistory(nextHistory);
    setChatMessage("");
    setError("");

    startChatting(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: activeSlug,
            message: sendingMessage,
            history: chatHistory.slice(-12),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "聊天失败");
        }

        setChatHistory((current) => [...current, { role: "assistant", content: data.reply }]);
      } catch (chatError) {
        setError(chatError.message);
      }
    });
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">朝花夕拾 • 智能回忆生成与对话测试</p>
          <h1>朝花夕拾</h1>
          <p className="hero-text">
            把聊天记录、回忆片段和人物印象整理成可回看、可生成、可测试聊天风格的 Web App。
            原有 prompts 和 tools 逻辑继续保留，后端负责解析与生成，前端负责展示与测试。
          </p>
        </div>

        <div className="status-strip">
          <div>
            <span className="status-label">后端状态</span>
            <strong>{health?.status || "连接中"}</strong>
          </div>
          <div>
            <span className="status-label">默认模型</span>
            <strong>{health?.model || "未检测到"}</strong>
          </div>
          <div>
            <span className="status-label">已生成人物</span>
            <strong>{exes.length}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="composer-card" onSubmit={handleGenerate}>
          <div className="section-head">
            <h2>素材输入</h2>
            <p>上传聊天记录，或者直接粘贴内容。</p>
          </div>

          <label>
            昵称 / 代号
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="例如：阿晚"
              required
            />
          </label>

          <label>
            基础信息
            <textarea
              rows="3"
              value={form.basicInfo}
              onChange={(event) => updateField("basicInfo", event.target.value)}
              placeholder="例如：在一起三年 大学同学 分手一年 她做设计"
            />
          </label>

          <label>
            性格画像
            <textarea
              rows="4"
              value={form.personalityProfile}
              onChange={(event) => updateField("personalityProfile", event.target.value)}
              placeholder="例如：ENFP 双子座 焦虑型 爱撒娇 翻旧账 嘴上说不在意其实比谁都在意"
            />
          </label>

          <div className="inline-grid">
            <label>
              文件类型
              <select
                value={form.sourceType}
                onChange={(event) => updateField("sourceType", event.target.value)}
              >
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              目标名称
              <input
                value={form.targetName}
                onChange={(event) => updateField("targetName", event.target.value)}
                placeholder="聊天记录中的发送者名称"
              />
            </label>
          </div>

          {form.sourceType === "social" ? (
            <label>
              社交平台
              <select
                value={form.socialPlatform}
                onChange={(event) => updateField("socialPlatform", event.target.value)}
              >
                {socialPlatforms.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="upload-box">
            上传文件
            <input
              type="file"
              multiple
              onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
            />
            <span>{selectedFiles.length ? selectedFiles.map((file) => file.name).join("，") : "可多选"}</span>
          </label>

          <label>
            直接粘贴文本
            <textarea
              rows="6"
              value={form.rawText}
              onChange={(event) => updateField("rawText", event.target.value)}
              placeholder="没有文件时，可以把聊天记录、描述、笔记直接贴进来。"
            />
          </label>

          <button className="primary-button" type="submit" disabled={isGenerating}>
            {isGenerating ? "正在生成..." : "生成人物画像和共同记忆"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="result-stack">
          <section className="result-card compact">
          <div className="section-head">
            <h2>生成概览</h2>
            <p>{result ? `人物标识：${result.slug}` : "结果会显示在这里"}</p>
          </div>
            <div className="meta-grid">
              <div>
                <span>生成目录</span>
                <strong>{result?.skill_dir || "-"}</strong>
              </div>
              <div>
                <span>使用模型</span>
                <strong>{result?.model || health?.model || "-"}</strong>
              </div>
              <div>
                <span>版本</span>
                <strong>{result?.meta?.version || "-"}</strong>
              </div>
              <div>
                <span>文件数</span>
                <strong>{result?.parsed_sources?.length || 0}</strong>
              </div>
            </div>
          </section>

          <ResultCard title="人物画像" content={result?.persona_markdown} />
          <ResultCard title="共同记忆" content={result?.memories_markdown} />
          <ResultCard title="共同记忆分析" content={result?.memories_analysis} />
          <ResultCard title="人物画像分析" content={result?.persona_analysis} />
        </div>
      </section>

      <section className="chat-lab">
        <div className="section-head">
          <h2>聊天测试页</h2>
          <p>选择一个人物档案，再直接试聊。</p>
        </div>

        <div className="inline-grid">
          <label>
            当前人物
            <select
              value={activeSlug}
              onChange={(event) => {
                setResult(null);
                setSelectedSlug(event.target.value);
                setChatHistory([]);
              }}
              disabled={isGenerating || exes.length === 0}
            >
              {exes.length === 0 ? <option value="">暂无可聊天的人物</option> : null}
              {exes.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}（{item.slug}）
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chat-window">
          {chatHistory.length === 0 ? (
            <div className="empty-chat">
              {isGenerating
                ? "正在生成人物，请稍候后再开始聊天测试。"
                : activeSlug
                  ? "已选中人物档案，可以在这里测试对话风格。"
                  : "请先生成或选择一个人物档案。"}
            </div>
          ) : (
            chatHistory.map((item, index) => (
              <article key={`${item.role}-${index}`} className={`chat-bubble ${item.role}`}>
                <span>{item.role === "user" ? "你" : "她"}</span>
                <p>{item.content}</p>
              </article>
            ))
          )}
        </div>

        <form className="chat-form" onSubmit={handleChat}>
          <input
            value={chatMessage}
            onChange={(event) => setChatMessage(event.target.value)}
            placeholder={
              isGenerating
                ? "人物生成中，请稍候"
                : activeSlug
                  ? "输入一句话试试"
                  : "请先生成或选择一个人物"
            }
            disabled={!activeSlug || isChatting || isGenerating}
          />
          <button type="submit" disabled={!activeSlug || isChatting || isGenerating}>
            {isChatting ? "发送中..." : "发送"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
