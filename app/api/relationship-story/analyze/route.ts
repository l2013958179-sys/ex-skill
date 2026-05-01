import { relationshipStoryPrompt } from "@/lib/ai/prompts";
import { isRelationshipAssistantId } from "@/lib/chat/roles";
import { normalizeRelationshipStoryAnalysis } from "@/lib/db/relationshipStories";
import {
  extractJsonObject,
  extractMessageText,
  requestAiChatCompletion,
  safeJsonParse,
} from "@/lib/server/ai-client";
import { requireAuthenticatedServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    await requireAuthenticatedServerUser(request);

    const body = await request.json();
    const storyText = typeof body?.story_text === "string" ? body.story_text.trim() : "";
    const assistantId = typeof body?.assistant_id === "string" ? body.assistant_id.trim() : "";

    if (!assistantId || !isRelationshipAssistantId(assistantId)) {
      return Response.json(
        { error: "当前助手暂不支持故事档案。", code: "invalid_assistant" },
        { status: 400 },
      );
    }

    if (!storyText) {
      return Response.json(
        { error: "故事内容不能为空。", code: "empty_story_text" },
        { status: 400 },
      );
    }

    const upstreamResponse = await requestAiChatCompletion({
      stream: false,
      temperature: 0.2,
      model: undefined,
      maxTokens: 1400,
      messages: [
        {
          role: "system",
          content: relationshipStoryPrompt,
        },
        {
          role: "user",
          content: storyText,
        },
      ],
    });

    const rawText = await upstreamResponse.text();
    if (!upstreamResponse.ok) {
      const parsed = safeJsonParse(rawText);
      const upstreamMessage =
        parsed?.error?.message || parsed?.message || "故事分析失败，请稍后重试。";

      return Response.json(
        {
          error: upstreamMessage,
          code: "upstream_error",
        },
        { status: upstreamResponse.status || 500 },
      );
    }

    const upstreamPayload = safeJsonParse(rawText);
    const modelText = extractMessageText(upstreamPayload) || rawText;
    const parsedAnalysis = extractJsonObject(modelText) || safeJsonParse(modelText);

    if (!parsedAnalysis || typeof parsedAnalysis !== "object") {
      return Response.json(
        { error: "AI 没有返回可保存的 JSON 档案。", code: "invalid_analysis_json" },
        { status: 502 },
      );
    }

    const analysis = normalizeRelationshipStoryAnalysis(parsedAnalysis as Record<string, unknown>, {
      assistantId,
      storyText,
    });

    return Response.json({
      analysis,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const status = "status" in error && typeof error.status === "number" ? error.status : 500;
      return Response.json(
        {
          error: getRequestErrorMessage(error, "请求失败，请稍后重试。"),
          code: String(error.code),
        },
        { status },
      );
    }

    if (error && typeof error === "object" && "code" in error && error.code === "missing_api_key") {
      return Response.json(
        { error: "API Key 未配置", code: "missing_api_key" },
        { status: 500 },
      );
    }

    console.error("分析 relationship story 失败:", error);
    return Response.json(
      {
        error: "故事分析失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
