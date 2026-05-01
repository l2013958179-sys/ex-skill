import { isRelationshipAssistantId } from "@/lib/chat/roles";
import { deleteRelationshipStory } from "@/lib/db/relationshipStories";
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
    const assistantId = typeof body?.assistant_id === "string" ? body.assistant_id.trim() : "";

    if (!assistantId || !isRelationshipAssistantId(assistantId)) {
      return Response.json(
        { error: "当前助手暂不支持故事档案。", code: "invalid_assistant" },
        { status: 400 },
      );
    }

    await deleteRelationshipStory(supabase, user.id, assistantId);

    return Response.json({
      ok: true,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const status = "status" in error && typeof error.status === "number" ? error.status : 500;
      return Response.json(
        {
          error: getRequestErrorMessage(error, "删除失败，请稍后重试。"),
          code: String(error.code),
        },
        { status },
      );
    }

    console.error("删除 relationship story 失败:", error);
    return Response.json(
      {
        error: "删除失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
