import { isRelationshipAssistantId } from "@/lib/chat/roles";
import { upsertRelationshipStory } from "@/lib/db/relationshipStories";
import { requireAuthenticatedServerUser } from "@/lib/supabase/server";

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuthenticatedServerUser(request);
    const body = await request.json();

    const storyText = typeof body?.story_text === "string" ? body.story_text.trim() : "";
    const assistantId = typeof body?.assistant_id === "string" ? body.assistant_id.trim() : "";
    const analysis =
      body?.analysis && typeof body.analysis === "object" && !Array.isArray(body.analysis)
        ? body.analysis
        : {};

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

    const story = await upsertRelationshipStory(supabase, user.id, assistantId, {
      ...analysis,
      story_text: storyText,
      raw_analysis: analysis,
    });

    return Response.json({
      story,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const status = "status" in error && typeof error.status === "number" ? error.status : 500;
      return Response.json(
        {
          error: getRequestErrorMessage(error, "保存失败，请稍后重试。"),
          code: String(error.code),
        },
        { status },
      );
    }

    console.error("保存 relationship story 失败:", error);
    return Response.json(
      {
        error: "保存失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
