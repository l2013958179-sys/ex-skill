export const runtime = "nodejs";

const ELEVENLABS_TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
const MAX_TTS_TEXT_LENGTH = 1800;

type CompanionVoiceRole = "girlfriend" | "boyfriend";

const VOICE_ENV_MAP: Record<CompanionVoiceRole, string> = {
  girlfriend: "ELEVENLABS_GIRLFRIEND_VOICE_ID",
  boyfriend: "ELEVENLABS_BOYFRIEND_VOICE_ID",
};

function getElevenLabsApiKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() || "";
}

function normalizeVoiceRole(value: unknown): CompanionVoiceRole | "" {
  if (typeof value !== "string" || !value.trim()) {
    return "girlfriend";
  }

  const normalized = value.trim().toLowerCase();

  if (["boyfriend", "ai-boyfriend", "boy", "male", "man"].includes(normalized)) {
    return "boyfriend";
  }

  if (
    [
      "girlfriend",
      "ai-girlfriend",
      "girl",
      "female",
      "woman",
      "companion",
      "ai-companion",
    ].includes(normalized)
  ) {
    return "girlfriend";
  }

  return "";
}

function getVoiceId(role: CompanionVoiceRole) {
  return process.env[VOICE_ENV_MAP[role]]?.trim() || "";
}

function getTtsModel() {
  return process.env.ELEVENLABS_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
}

function jsonError(error: string, status = 500, code = "elevenlabs_tts_error") {
  return Response.json({ error, code }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const role = normalizeVoiceRole(body?.role || body?.companionType);

  if (!text) {
    return jsonError("请提供需要朗读的文本。", 400, "missing_tts_text");
  }

  if (!role) {
    return jsonError(
      "当前角色类型无法识别，请切换 AI女友或 AI男友后重试。",
      400,
      "unknown_companion_voice_role",
    );
  }

  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    return jsonError(
      "ElevenLabs 语音服务未配置，请在服务端设置 ELEVENLABS_API_KEY。",
      500,
      "missing_elevenlabs_api_key",
    );
  }

  const voiceId = getVoiceId(role);
  if (!voiceId) {
    return jsonError(
      "当前角色声音未配置，请检查 ElevenLabs Voice ID。",
      500,
      `missing_elevenlabs_${role}_voice_id`,
    );
  }

  try {
    const safeText = text.slice(0, MAX_TTS_TEXT_LENGTH);
    const url = `${ELEVENLABS_TTS_BASE_URL}/${encodeURIComponent(
      voiceId,
    )}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: safeText,
        model_id: getTtsModel(),
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.78,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const upstreamMessage = await response.text().catch(() => "");
      console.error("ElevenLabs Text to Speech 请求失败:", {
        status: response.status,
        body: upstreamMessage.slice(0, 500),
      });

      return jsonError(
        "AI 语音生成失败，请稍后重试。",
        response.status >= 500 ? 502 : 400,
        "elevenlabs_tts_request_failed",
      );
    }

    const audio = await response.arrayBuffer();

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("/api/text-to-speech 出错:", error);
    return jsonError("AI 语音生成失败，请稍后重试。", 500, "text_to_speech_server_error");
  }
}
