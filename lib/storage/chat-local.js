const STORAGE_KEY = "chaohuaxishi-chat-state";
const SYNC_META_KEY = "chaohuaxishi-chat-sync-meta";

export const DEFAULT_PREFERENCES = {
  userNickname: "",
  girlfriendStyleId: "gentle",
  customPersona: "",
  roleId: "general",
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeAttachment(attachment) {
  if (!attachment || attachment.type !== "image") {
    return null;
  }

  return {
    id: typeof attachment.id === "string" ? attachment.id : createId(),
    type: "image",
    name: normalizeText(attachment.name, "image"),
    mimeType: normalizeText(attachment.mimeType, "image/png"),
    dataUrl: normalizeText(attachment.dataUrl),
  };
}

function normalizeMessage(message) {
  if (!message || (message.role !== "user" && message.role !== "assistant")) {
    return null;
  }

  return {
    id: typeof message.id === "string" ? message.id : createId(),
    role: message.role,
    content: normalizeText(message.content),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(normalizeAttachment).filter(Boolean)
      : [],
    createdAt:
      typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
  };
}

function normalizePreferences(preferences) {
  return {
    roleId: normalizeText(preferences?.roleId, DEFAULT_PREFERENCES.roleId),
    userNickname: normalizeText(preferences?.userNickname, DEFAULT_PREFERENCES.userNickname),
    girlfriendStyleId: normalizeText(
      preferences?.girlfriendStyleId,
      DEFAULT_PREFERENCES.girlfriendStyleId,
    ),
    customPersona: normalizeText(preferences?.customPersona, DEFAULT_PREFERENCES.customPersona),
  };
}

function normalizeSession(session, preferences) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const messages = Array.isArray(session.messages)
    ? session.messages.map(normalizeMessage).filter(Boolean)
    : [];
  const now = new Date().toISOString();

  return {
    id: typeof session.id === "string" ? session.id : createId(),
    title: typeof session.title === "string" && session.title.trim() ? session.title : "新对话",
    roleId: normalizeText(session.roleId, preferences.roleId),
    userNickname: normalizeText(session.userNickname, preferences.userNickname),
    girlfriendStyleId: normalizeText(session.girlfriendStyleId, preferences.girlfriendStyleId),
    customPersona: normalizeText(session.customPersona, preferences.customPersona),
    createdAt: typeof session.createdAt === "string" ? session.createdAt : now,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : now,
    messages,
  };
}

export function createMessage(role, content, options = {}) {
  return {
    id: createId(),
    role,
    content,
    attachments: Array.isArray(options.attachments)
      ? options.attachments.map(normalizeAttachment).filter(Boolean)
      : [],
    createdAt: new Date().toISOString(),
  };
}

export function deriveSessionTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content);
  if (!firstUserMessage) {
    return "新对话";
  }

  const title = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export function createSession(options = {}) {
  const now = new Date().toISOString();
  const preferences = normalizePreferences(options);

  return {
    id: createId(),
    title: "新对话",
    roleId: preferences.roleId,
    userNickname: preferences.userNickname,
    girlfriendStyleId: preferences.girlfriendStyleId,
    customPersona: preferences.customPersona,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function createInitialChatState(options = {}) {
  const preferences = normalizePreferences(options);
  const firstSession = createSession(preferences);

  return {
    sessions: [firstSession],
    activeSessionId: firstSession.id,
    preferences,
  };
}

export function loadChatState() {
  if (typeof window === "undefined") {
    return createInitialChatState();
  }

  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
      return createInitialChatState();
    }

    const parsed = JSON.parse(rawState);
    const preferences = normalizePreferences(parsed?.preferences);
    const sessions = Array.isArray(parsed?.sessions)
      ? parsed.sessions.map((session) => normalizeSession(session, preferences)).filter(Boolean)
      : [];

    if (!sessions.length) {
      return createInitialChatState(preferences);
    }

    const activeSessionId =
      typeof parsed?.activeSessionId === "string" &&
      sessions.some((session) => session.id === parsed.activeSessionId)
        ? parsed.activeSessionId
        : sessions[0].id;

    return {
      sessions,
      activeSessionId,
      preferences,
    };
  } catch (error) {
    console.error("读取 localStorage 会话失败:", error);
    return createInitialChatState();
  }
}

export function saveChatState(state) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = {
      sessions: Array.isArray(state?.sessions) ? state.sessions : [],
      activeSessionId: normalizeText(state?.activeSessionId),
      preferences: normalizePreferences(state?.preferences),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("保存 localStorage 会话失败:", error);
  }
}

function loadSyncMetaMap() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawState = window.localStorage.getItem(SYNC_META_KEY);
    return rawState ? JSON.parse(rawState) : {};
  } catch (error) {
    console.error("读取聊天同步元数据失败:", error);
    return {};
  }
}

function saveSyncMetaMap(map) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(map));
  } catch (error) {
    console.error("保存聊天同步元数据失败:", error);
  }
}

export function hasMeaningfulGuestData(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  return sessions.some(
    (session) =>
      session.messages?.length ||
      session.title !== "新对话" ||
      session.roleId !== DEFAULT_PREFERENCES.roleId ||
      session.userNickname ||
      session.customPersona,
  );
}

export function getGuestSessionsNeedingSync(userId, state) {
  const syncMeta = loadSyncMetaMap();
  const userMeta = syncMeta?.[userId] || {};
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];

  return sessions.filter((session) => {
    if (!session?.id) {
      return false;
    }

    const syncedAt = userMeta[session.id];
    return !syncedAt || syncedAt !== session.updatedAt;
  });
}

export function markGuestSessionsSynced(userId, sessions) {
  const syncMeta = loadSyncMetaMap();
  const userMeta = syncMeta?.[userId] || {};

  for (const session of sessions) {
    if (session?.id && session?.updatedAt) {
      userMeta[session.id] = session.updatedAt;
    }
  }

  syncMeta[userId] = userMeta;
  saveSyncMetaMap(syncMeta);
}
