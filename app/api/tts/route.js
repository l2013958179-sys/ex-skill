import {
  buildTtsTemplateResponse,
  getTtsProviderCatalog,
  synthesizeSpeechTemplate,
  validateTtsTemplatePayload,
} from "@/lib/tts/server";

export async function GET() {
  return Response.json({
    endpoint: "/api/tts",
    providers: getTtsProviderCatalog(),
    exampleRequest: buildTtsTemplateResponse({
      provider: "volcengine",
      text: "今天辛苦了，我在。你可以慢慢说，我们一件一件来。",
      companionType: "girlfriend",
      emotion: "normal",
      metadata: {
        sessionId: "demo-session",
        messageId: "assistant-message-id",
      },
    }).requestContract,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const validation = validateTtsTemplatePayload(body);

    if (!validation.ok) {
      return Response.json(
        {
          error: validation.error,
          code: validation.code,
        },
        { status: validation.status || 400 },
      );
    }

    const result = await synthesizeSpeechTemplate(validation);
    return Response.json(
      {
        error: result.error,
        code: result.code,
        template: result.template,
      },
      { status: result.status || 501 },
    );
  } catch (error) {
    console.error("/api/tts 模板接口出错:", error);
    return Response.json(
      {
        error: "TTS 模板接口请求失败，请检查请求体或服务端日志。",
        code: "tts_template_server_error",
      },
      { status: 500 },
    );
  }
}
