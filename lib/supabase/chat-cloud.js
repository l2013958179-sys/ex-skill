import { createInitialChatState } from "@/lib/storage/chat-local";
import {
  hydrateMessageAttachments,
  resolveMessageAttachments,
  serializeAttachmentsForDatabase,
} from "@/lib/supabase/storage";
import { normalizeEmotion } from "@/lib/chat/emotion";

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ensureUuid(value) {
  if (isUuid(value)) {
    return value;
  }

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return null;
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function assertAuthenticatedUserId(userId) {
  if (!userId) {
    throw new Error("请先登录");
  }
}

function serializePersona(session) {
  return JSON.stringify({
    userNickname: normalizeText(session?.userNickname),
    companionType: session?.companionType === "boyfriend" ? "boyfriend" : "girlfriend",
    girlfriendStyleId: normalizeText(session?.girlfriendStyleId, "gentle"),
    customPersona: normalizeText(session?.customPersona),
  });
}

function parsePersona(value) {
  if (!value) {
    return {
      userNickname: "",
      companionType: "girlfriend",
      girlfriendStyleId: "gentle",
      customPersona: "",
    };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      userNickname: normalizeText(parsed?.userNickname),
      companionType: parsed?.companionType === "boyfriend" ? "boyfriend" : "girlfriend",
      girlfriendStyleId: normalizeText(parsed?.girlfriendStyleId, "gentle"),
      customPersona: normalizeText(parsed?.customPersona),
    };
  } catch {
    return {
      userNickname: "",
      companionType: "girlfriend",
      girlfriendStyleId: "gentle",
      customPersona: normalizeText(value),
    };
  }
}

function buildPreferencesFromSessions(sessions, fallbackPreferences) {
  const source = sessions[0];
  if (!source) {
    return fallbackPreferences;
  }

  return {
    roleId: source.roleId,
    userNickname: source.userNickname,
    companionType: source.companionType,
    girlfriendStyleId: source.girlfriendStyleId,
    customPersona: source.customPersona,
  };
}

export async function loadCloudChatState(supabase, userId, fallbackPreferences) {
  assertAuthenticatedUserId(userId);

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, user_id, title, role, girlfriend_persona, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (conversationsError) {
    throw conversationsError;
  }

  if (!conversations?.length) {
    return createInitialChatState(fallbackPreferences);
  }

  const conversationIds = conversations.map((item) => item.id);
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw messagesError;
  }

  const groupedMessages = new Map();
  const hydratedMessages = await resolveMessageAttachments(supabase, messages || []);

  for (const message of hydratedMessages) {
    const current = groupedMessages.get(message.conversation_id) || [];
    current.push({
      id: message.id,
      role: message.role,
      content: message.content,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      emotion: message.role === "assistant" ? normalizeEmotion(message.emotion) : undefined,
      createdAt: message.created_at,
    });
    groupedMessages.set(message.conversation_id, current);
  }

  const sessions = conversations.map((conversation) => {
    const persona = parsePersona(conversation.girlfriend_persona);
    return {
      id: conversation.id,
      title: conversation.title || "新对话",
      roleId: normalizeText(conversation.role, fallbackPreferences.roleId),
      userNickname: persona.userNickname,
      companionType: persona.companionType,
      girlfriendStyleId: persona.girlfriendStyleId,
      customPersona: persona.customPersona,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at || conversation.created_at,
      messages: groupedMessages.get(conversation.id) || [],
    };
  });

  return {
    sessions,
    activeSessionId: sessions[0].id,
    preferences: buildPreferencesFromSessions(sessions, fallbackPreferences),
  };
}

export async function upsertConversationMetadata(supabase, userId, session) {
  assertAuthenticatedUserId(userId);

  const conversationId = ensureUuid(session?.id);
  if (!conversationId) {
    throw new Error("会话 ID 无效，无法保存到云端。");
  }

  const payload = {
    id: conversationId,
    user_id: userId,
    title: normalizeText(session?.title, "新对话"),
    role: normalizeText(session?.roleId, "general"),
    girlfriend_persona: serializePersona(session),
    created_at: session?.createdAt || new Date().toISOString(),
    updated_at: session?.updatedAt || new Date().toISOString(),
  };

  const { error } = await supabase
    .from("conversations")
    .upsert(payload, {
      onConflict: "id",
    });
  if (error) {
    throw error;
  }

  return conversationId;
}

export async function replaceConversationMessages(supabase, userId, conversationId, messages) {
  assertAuthenticatedUserId(userId);

  const { error: deleteError } = await supabase
    .from("messages")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_id", conversationId);

  if (deleteError) {
    throw deleteError;
  }

  if (!messages?.length) {
    return;
  }

  const hydratedMessages = await hydrateMessageAttachments(supabase, userId, messages);
  const rows = hydratedMessages.map((message) => ({
    conversation_id: conversationId,
    user_id: userId,
    role: message.role,
    content: message.content,
    attachments: serializeAttachmentsForDatabase(message.attachments),
    emotion: message.role === "assistant" ? normalizeEmotion(message.emotion) : null,
    created_at: message.createdAt || new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from("messages").insert(rows);
  if (insertError) {
    const normalizedMessage =
      typeof insertError.message === "string" ? insertError.message.toLowerCase() : "";
    const missingAttachmentsColumn = normalizedMessage.includes("attachments");
    const missingEmotionColumn = normalizedMessage.includes("emotion");

    if (!missingAttachmentsColumn && !missingEmotionColumn) {
      throw insertError;
    }

    const fallbackRows = rows.map((row) => {
      const nextRow = { ...row };

      if (missingAttachmentsColumn) {
        delete nextRow.attachments;
      }

      if (missingEmotionColumn) {
        delete nextRow.emotion;
      }

      return nextRow;
    });
    const { error: fallbackError } = await supabase.from("messages").insert(fallbackRows);
    if (fallbackError) {
      throw fallbackError;
    }
  }
}

export async function syncConversationToCloud(supabase, userId, session) {
  assertAuthenticatedUserId(userId);
  const conversationId = await upsertConversationMetadata(supabase, userId, session);
  if (session.messages?.length) {
    await replaceConversationMessages(supabase, userId, conversationId, session.messages || []);
  }
  return conversationId;
}

export async function deleteConversationFromCloud(supabase, userId, conversationId) {
  assertAuthenticatedUserId(userId);

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("user_id", userId)
    .eq("id", conversationId);

  if (error) {
    throw error;
  }
}

export async function syncGuestSessionsToCloud(supabase, userId, sessions) {
  assertAuthenticatedUserId(userId);

  for (const session of sessions) {
    await syncConversationToCloud(supabase, userId, session);
  }
}
