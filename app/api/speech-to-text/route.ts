export const runtime = "nodejs";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_STT_MODEL = "scribe_v1";
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

function getElevenLabsApiKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() || "";
}

function getSttModel() {
  return process.env.ELEVENLABS_STT_MODEL?.trim() || DEFAULT_STT_MODEL;
}

function jsonError(error: string, status = 500, code = "elevenlabs_stt_error") {
  return Response.json({ error, code }, { status });
}

export async function POST(request: Request) {
  const apiKey = getElevenLabsApiKey();

  if (!apiKey) {
    return jsonError(
      "ElevenLabs 语音识别未配置，请在服务端设置 ELEVENLABS_API_KEY。",
      500,
      "missing_elevenlabs_api_key",
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("请上传录音文件。", 400, "missing_audio_file");
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return jsonError("录音文件过大，请缩短录音后重试。", 413, "audio_file_too_large");
    }

    const elevenLabsFormData = new FormData();
    elevenLabsFormData.append("file", file, file.name || "voice-input.webm");
    elevenLabsFormData.append("model_id", getSttModel());

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: elevenLabsFormData,
    });

    if (!response.ok) {
      const upstreamMessage = await response.text().catch(() => "");
      console.error("ElevenLabs Speech to Text 请求失败:", {
        status: response.status,
        body: upstreamMessage.slice(0, 500),
      });

      return jsonError(
        "语音识别失败，请重试。",
        response.status >= 500 ? 502 : 400,
        "elevenlabs_stt_request_failed",
      );
    }

    const payload = await response.json();
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";

    return Response.json({ text });
  } catch (error) {
    console.error("/api/speech-to-text 出错:", error);
    return jsonError("语音识别失败，请重试。", 500, "speech_to_text_server_error");
  }
}
