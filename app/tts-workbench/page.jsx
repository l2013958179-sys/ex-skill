import Link from "next/link";

import GlassCard from "@/components/ui/GlassCard";
import { getTtsProviderCatalog } from "@/lib/tts/server";

export const metadata = {
  title: "TTS 接入骨架台",
  description: "第三方 TTS provider 的接入骨架页与接口模板说明。",
};

function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export default function TtsWorkbenchPage() {
  const providers = getTtsProviderCatalog();
  const serverProviders = providers.filter((item) => item.routeKind === "server");

  return (
    <main className="tts-workbench-page">
      <section className="tts-workbench-hero">
        <div>
          <p className="eyebrow">TTS Workbench</p>
          <h1>第三方 TTS API 接入骨架台</h1>
          <p>
            这里把 provider 元数据、环境变量、服务端模板接口和建议的返回契约放到了一处。
            后面不管接火山、讯飞、Edge 还是阿里云，都可以直接沿着这个骨架继续填真实请求。
          </p>
        </div>

        <div className="tts-workbench-hero-actions">
          <Link href="/" className="ui-button" data-variant="primary" data-theme="romance">
            返回聊天页
          </Link>
          <a
            href="/api/tts"
            target="_blank"
            rel="noreferrer"
            className="ui-button"
            data-variant="ghost"
            data-theme="romance"
          >
            查看 /api/tts
          </a>
        </div>
      </section>

      <section className="tts-workbench-grid">
        {serverProviders.map((provider) => (
          <GlassCard
            key={provider.id}
            className="tts-provider-card"
            theme="romance"
          >
            <div className="tts-provider-card-head">
              <div>
                <strong>{provider.label}</strong>
                <span>{provider.description}</span>
              </div>
              <span className={`tts-provider-status ${provider.configured ? "ready" : "pending"}`}>
                {provider.configured ? "环境已配置" : "等待环境变量"}
              </span>
            </div>

            <div className="tts-provider-copy">
              <p>适配函数：{provider.adapterKey}</p>
              <p>接口入口：`POST /api/tts`</p>
            </div>

            <div className="tts-provider-section">
              <strong>必填环境变量</strong>
              <ul className="tts-inline-list">
                {provider.envKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>

            <div className="tts-provider-section">
              <strong>建议请求体</strong>
              <pre>{toPrettyJson(provider.requestShape)}</pre>
            </div>

            <div className="tts-provider-section">
              <strong>后续接入步骤</strong>
              <ol className="tts-inline-list ordered">
                {provider.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </GlassCard>
        ))}
      </section>

      <GlassCard className="tts-contract-card" theme="romance">
        <div className="tts-provider-card-head">
          <div>
            <strong>统一接口契约</strong>
            <span>后面真实接音频流时，建议继续沿用这套输入输出约定。</span>
          </div>
        </div>

        <div className="tts-contract-grid">
          <div className="tts-provider-section">
            <strong>请求</strong>
            <pre>
              {toPrettyJson({
                provider: "volcengine",
                text: "今天辛苦了，我在。你可以慢慢说，我们一件一件来。",
                companionType: "girlfriend",
                emotion: "normal",
                voice: "BV001_streaming",
                format: "mp3",
                metadata: {
                  sessionId: "demo-session",
                  messageId: "assistant-message-id",
                },
              })}
            </pre>
          </div>

          <div className="tts-provider-section">
            <strong>返回约定</strong>
            <pre>
              {toPrettyJson({
                success: "audio/mpeg | audio/wav | audio/ogg",
                error: {
                  error: "字符串错误信息",
                  code: "稳定错误码",
                },
                headers: ["Content-Type", "Cache-Control", "X-TTS-Provider", "X-TTS-Voice"],
              })}
            </pre>
          </div>
        </div>
      </GlassCard>
    </main>
  );
}
