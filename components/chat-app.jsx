"use client";

import { useEffect, useRef, useState } from "react";

import AuthModal from "@/components/auth-modal";
import LoadingDots from "@/components/loading-dots";
import MemoryManager from "@/components/memory-manager";
import MessageInput from "@/components/message-input";
import RelationshipStoryPanel from "@/components/relationship/RelationshipStoryPanel";
import RoleSettings from "@/components/role-settings";
import SessionSidebar from "@/components/session-sidebar";
import VirtualCompanionPanel from "@/components/virtual-companion-panel";
import AssistantHeader from "@/components/ui/AssistantHeader";
import EmptyChatState from "@/components/ui/EmptyChatState";
import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";
import MarkdownMessage from "@/components/ui/MarkdownMessage";
import { buildApiUrl, getApiBaseUrlIssue } from "@/lib/browser/api-url";
import { installClientErrorDiagnostics } from "@/lib/browser/client-debug";
import {
  GIRLFRIEND_STYLES,
  ROLES,
  getCompanionProfile,
  getGirlfriendStyleById,
  getRoleById,
  isRelationshipAssistantId,
} from "@/lib/chat/roles";
import { inferEmotionFromText, resolveEmotion } from "@/lib/chat/emotion";
import { loadRelationshipStory } from "@/lib/db/relationshipStories";
import {
  buildMemorySummaryText,
  mergeMemoryItems,
  removeMemoryItem,
  upsertMemoryItem,
} from "@/lib/memory/profile";
import {
  deleteConversationFromCloud,
  loadCloudChatState,
  syncConversationToCloud,
  syncGuestSessionsToCloud,
  upsertConversationMetadata,
} from "@/lib/supabase/chat-cloud";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  isSupabaseSchemaMissingError,
  logSupabaseError,
} from "@/lib/supabase/client";
import {
  clearCloudMemoryItems,
  deleteCloudMemoryItem,
  loadCloudMemoryItems,
  upsertCloudMemoryItems,
} from "@/lib/supabase/user-memory-cloud";
import {
  DEFAULT_PREFERENCES,
  createInitialChatState,
  createMessage,
  createSession,
  clearLocalChatStorage,
  deriveSessionTitle,
  getLocalChatStorageError,
  getGuestSessionsNeedingSync,
  hasMeaningfulGuestData,
  loadChatState,
  markGuestSessionsSynced,
  saveChatState,
} from "@/lib/storage/chat-local";
import {
  clearLocalMemoryItems,
  loadLocalMemoryItems,
  saveLocalMemoryItems,
} from "@/lib/storage/user-memory";
import {
  DEFAULT_VIRTUAL_COMPANION_PREFS,
  loadVirtualCompanionPrefs,
  saveVirtualCompanionPrefs,
} from "@/lib/storage/virtual-companion-prefs";

const STARTER_PROMPTS = {
  general: [
    "帮我把今天的待办整理成一个优先级清单",
    "写一段简洁自然的自我介绍",
    "帮我把这段想法梳理成清楚的表达",
  ],
  coder: [
    "帮我定位这段代码为什么会报错",
    "给我一个 Next.js 调用流式接口的示例",
    "帮我写一个更稳的错误处理方案",
  ],
  study: [
    "帮我列一个这周的学习计划",
    "把这个知识点讲给零基础的人听",
    "帮我做一个 30 分钟的复习安排",
  ],
  translator: [
    "把这段中文翻成自然英文",
    "把这段英文改得更像口语表达",
    "给我一个更商务一点的英文版本",
  ],
  girlfriend: [
    "今天有点累，想听你哄哄我",
    "监督我今晚把这两个任务做完",
    "睡前陪我聊一会儿，提醒我早点休息",
  ],
};

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 1024 * 1024 * 4;
const SECTION_IDS = {
  chat: "chat-section",
  intimacy: "intimacy-section",
  emotion: "emotion-journal-section",
  story: "story-section",
  memory: "memory-section",
  settings: "settings-section",
};

const COMPANION_THEMES = {
  girlfriend: {
    icon: "✿",
    aura: "heart",
    moodPrefix: "小柠",
  },
  boyfriend: {
    icon: "✦",
    aura: "star",
    moodPrefix: "阿辰",
  },
};

const MOBILE_NAV_ITEMS = [
  { id: "chat", label: "聊天", icon: "💬" },
  { id: "intimacy", label: "状态", icon: "💞" },
  { id: "memory", label: "记忆", icon: "🧠" },
  { id: "story", label: "故事", icon: "📖" },
  { id: "settings", label: "设置", icon: "⚙" },
];

function clampScore(value, fallback = 68) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

async function readApiError(response) {
  try {
    const payload = await response.json();
    if (payload?.code === "missing_api_key") {
      return "API Key 未配置";
    }
    if (payload?.code === "upstream_forbidden") {
      return (
        payload?.error ||
        "AI 上游服务拒绝访问，请检查线上 AI_BASE_URL、AI_API_KEY、AI_MODEL 或上游域名访问权限。"
      );
    }
    if (payload?.code === "invalid_ai_base_url") {
      return "AI_BASE_URL 当前指向网页控制台，不是模型接口地址。请填写 OpenAI 兼容接口根路径。";
    }
    if (payload?.code === "vision_not_supported") {
      return "当前模型暂不支持图片理解";
    }
    return payload?.error || "AI 服务暂时不可用，请稍后重试。";
  } catch {
    return "AI 服务暂时不可用，请稍后重试。";
  }
}

function formatChatFailureMessage(message) {
  if (!message) {
    return "我刚才没有拿到回复，网络好像短暂开小差了。稍后点“重新发送”，我会继续接上。";
  }

  if (message.includes("限流") || message.includes("请求过于频繁")) {
    return `我这边被上游 AI 服务临时限流了。先等 30-60 秒，再点“重新发送”，我会继续接上。`;
  }

  if (message.includes("临时不可用") || message.includes("temporarily unavailable")) {
    return `AI 服务商现在有点不稳定，我已经自动重试过一次。稍等片刻点“重新发送”，我们继续聊。`;
  }

  if (message.includes("通道暂不可用") || message.includes("No available channel")) {
    return `当前 AI 模型通道暂时不可用，需要服务商后台恢复模型通道。恢复后点“重新发送”就能继续。`;
  }

  if (message.includes("上游服务拒绝访问") || message.includes("no access to model")) {
    return "我这边连不上当前 AI 服务，上游接口拒绝了请求。请检查线上 AI 配置，修好后点“重新发送”就能继续。";
  }

  return `我刚才没有拿到回复：${message}`;
}

function isSupabaseError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("code" in error || "details" in error || "hint" in error),
  );
}

function getCloudSyncMessage(error, fallback) {
  if (!error) {
    return fallback;
  }

  if (error.message === "请先登录") {
    return "请先登录";
  }

  if (error.code === "42501") {
    return "Supabase 数据库权限未配置完成，请先执行 schema.sql 中的 grant 授权语句。";
  }

  if (error.code === "42P01") {
    return "Supabase 表结构未完整创建，请先执行最新的 schema.sql。";
  }

  if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") {
    return "Supabase 表结构还是旧版本，请重新执行最新的 schema.sql，让缺失的表和字段补齐。";
  }

  if (typeof error.message === "string" && error.message.toLowerCase().includes("bucket")) {
    return "Supabase Storage bucket 未创建，请执行最新的 schema.sql 后重试。";
  }

  return fallback;
}

function mapAuthErrorMessage(message, mode) {
  if (!message) {
    return mode === "login" ? "登录失败，请稍后重试。" : "注册失败，请稍后重试。";
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "邮箱或密码错误。";
  }

  if (normalized.includes("email not confirmed")) {
    return "邮箱尚未确认，请先到邮箱完成验证。";
  }

  if (normalized.includes("email rate limit exceeded")) {
    return "验证邮件发送过于频繁，请稍后再试；如果这个邮箱刚注册过，也可以直接切到登录。";
  }

  if (normalized.includes("user already registered")) {
    return "这个邮箱已经注册过了，请直接登录。";
  }

  if (normalized.includes("password should be at least")) {
    return "密码至少需要 6 位。";
  }

  if (normalized.includes("unable to validate email address")) {
    return "请输入有效的邮箱地址。";
  }

  if (normalized.includes("signup is disabled")) {
    return "当前项目暂未开放注册，请联系管理员。";
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "网络异常，请检查连接后重试。";
  }

  return message;
}

function isExpectedAuthError(message) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return [
    "invalid login credentials",
    "email not confirmed",
    "email rate limit exceeded",
    "user already registered",
    "password should be at least",
    "unable to validate email address",
    "signup is disabled",
  ].some((keyword) => normalized.includes(keyword));
}

function getLastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return messages[index];
    }
  }
  return null;
}

function getLastAssistantMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      return messages[index];
    }
  }
  return null;
}

function getAttachmentUrl(attachment) {
  return attachment?.dataUrl || attachment?.signedUrl || attachment?.publicUrl || attachment?.url || "";
}

function formatMessageTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function decodeHeaderValue(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getAssistantMessageProfile(message, session) {
  const companion = getCompanionProfile(message?.companionType || session?.companionType);
  const companionName =
    typeof message?.companionName === "string" && message.companionName.trim()
      ? message.companionName.trim()
      : companion.name;

  return {
    companionType: companion.id,
    companionLabel: companion.label,
    companionName,
    avatarText: companionName.slice(-1) || companion.label.slice(-1) || "伴",
  };
}

function getAssistantMessageTitle(message, session) {
  const assistantProfile = getAssistantMessageProfile(message, session);
  return `${assistantProfile.companionName} · ${assistantProfile.companionLabel}`;
}

function getCompanionTheme(companionType) {
  return COMPANION_THEMES[companionType] || COMPANION_THEMES.girlfriend;
}

function getRelationshipMoodCopy(companionName, companionType, emotion) {
  const theme = getCompanionTheme(companionType);

  if (emotion === "happy") {
    return {
      title: `${companionName} 的心情`,
      text:
        theme.aura === "heart"
          ? `${companionName} 像刚收好剑与披风一样放松，想把温柔、勇敢和偏爱都继续留给你。`
          : `${companionName} 今天状态很稳，想继续把冷静的守护感和可靠的安心感留在你身边。`,
    };
  }

  if (emotion === "sad") {
    return {
      title: `${companionName} 的心情`,
      text:
        theme.aura === "heart"
          ? `${companionName} 想先轻轻抱抱你，陪你把委屈和疲惫慢慢放下，再一起想办法。`
          : `${companionName} 想安静守在你身边，把那些没说出口的压力一点点接住，不让你一个人扛。`,
    };
  }

  return {
    title: `${companionName} 的心情`,
    text:
      theme.aura === "heart"
        ? `${companionName} 现在很平静，想和你聊一点柔软日常，也想像温柔剑士一样认真护住你的情绪。`
        : `${companionName} 现在很平静，想用稳稳的陪伴和守护感陪你把今天慢慢聊完。`,
  };
}

function getMemoryHighlights(items) {
  return items
    .filter((item) => item?.content)
    .slice(-3)
    .reverse()
    .map((item, index) => ({
      id: `${item.memoryType || "memory"}_${index}`,
      title: item.memoryType || "memory",
      content: item.content,
      source: item.source,
      updatedAt: item.updatedAt,
    }));
}

function getRegenerateRequest(session) {
  if (!session?.messages?.length) {
    return null;
  }

  const baseMessages = [...session.messages];
  if (baseMessages[baseMessages.length - 1]?.role === "assistant") {
    baseMessages.pop();
  }

  const lastUserMessage = getLastUserMessage(baseMessages);
  if (!lastUserMessage) {
    return null;
  }

  return {
    content: lastUserMessage.content || "",
    attachment: lastUserMessage.attachments?.[0] || null,
    messages: baseMessages,
  };
}

function toApiMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function normalizeSpeechText(content) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, "这段代码我先略过。")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function createSessionPayload(session) {
  return {
    assistantId: session.roleId,
    roleId: session.roleId,
    companionType: session.companionType,
    userNickname: session.userNickname,
    girlfriendStyleId: session.girlfriendStyleId,
    customPersona: session.customPersona,
  };
}

function getSessionsByAssistant(sessions, assistantId) {
  return sessions.filter((session) => session.roleId === assistantId);
}

function getRoleBannerCopy(session, memorySummary) {
  const role = getRoleById(session?.roleId);
  if (role.id !== "girlfriend") {
    return {
      title: role.label,
      description: memorySummary
        ? `${role.description} 当前还能参考你整理好的长期记忆与偏好。`
        : role.description,
    };
  }

  const style = getGirlfriendStyleById(session?.girlfriendStyleId);
  const companion = getCompanionProfile(session?.companionType);
  const nickname = session?.userNickname?.trim();
  return {
    title: `AI伴侣 · ${companion.label} · ${companion.name}`,
    description: nickname
      ? `${companion.name} 会优先用“${nickname}”称呼你，以 ${companion.styleLabel} 的气质和 ${style.label} 的节奏陪你聊天${memorySummary ? "，也会自然参考你导入的记忆" : ""}。`
      : `${companion.name} 当前启用 ${style.label}，会以 ${companion.styleLabel} 的氛围、恋爱感和陪伴感和你聊天${memorySummary ? "，并结合已保存的记忆" : ""}。`,
  };
}

function getRolePresenceCopy(session, memorySummary) {
  const role = getRoleById(session?.roleId);
  if (role.id !== "girlfriend") {
    return {
      title: role.label,
      status: "在线",
      subtitle: memorySummary ? "会结合当前会话与你的记忆摘要来回答。" : role.description,
    };
  }

  const style = getGirlfriendStyleById(session?.girlfriendStyleId);
  const companion = getCompanionProfile(session?.companionType);
  const nickname = session?.userNickname?.trim();
  return {
    title: nickname ? `${companion.name} · 对你在线` : `${companion.name} · ${companion.label}`,
    status: "陪伴中",
    subtitle: nickname
      ? `会优先用“${nickname}”称呼你${memorySummary ? "，并自然参考你分享过的偏好。" : `，以${companion.styleLabel}的气质陪你聊天。`}`
      : memorySummary
        ? `已开启 ${companion.styleLabel} 回复，也会结合你的长期偏好来聊天。`
        : "已开启 AI伴侣 回复，可以在下方选择 AI女友 / AI男友 并填写人设。",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("读取图片失败，请重新选择。"));
    reader.readAsDataURL(file);
  });
}

function getMemoryStorageMode(user) {
  return user ? "cloud" : "local";
}

async function getAuthorizedJsonHeaders(supabase) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!supabase) {
    return headers;
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export default function ChatApp() {
  const supabase = getSupabaseBrowserClient();
  const [initialChatState] = useState(() => createInitialChatState());

  const guestStateRef = useRef(initialChatState);
  const guestMemoryRef = useRef([]);
  const sessionsRef = useRef([]);
  const activeSessionIdRef = useRef("");
  const bottomAnchorRef = useRef(null);
  const abortControllerRef = useRef(null);
  const streamRuntimeRef = useRef(null);
  const speechAudioRef = useRef(null);
  const speechAudioUrlRef = useRef("");
  const speechRequestTokenRef = useRef(0);

  const [sessions, setSessions] = useState(initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialChatState.activeSessionId);
  const [preferences, setPreferences] = useState(initialChatState.preferences);
  const [composer, setComposer] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [memoryItems, setMemoryItems] = useState([]);
  const [error, setError] = useState("");
  const [startupError, setStartupError] = useState("");
  const [startupNeedsRecovery, setStartupNeedsRecovery] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [bootLongWait, setBootLongWait] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [speechLoadingMessageId, setSpeechLoadingMessageId] = useState("");
  const [playingSpeechMessageId, setPlayingSpeechMessageId] = useState("");
  const [lastFailedRequest, setLastFailedRequest] = useState(null);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeNavigationKey, setActiveNavigationKey] = useState("chat");
  const [relationshipStorySnapshot, setRelationshipStorySnapshot] = useState(null);
  const [virtualCompanionPrefs, setVirtualCompanionPrefs] = useState(
    DEFAULT_VIRTUAL_COMPANION_PREFS,
  );
  const [virtualPrefsReady, setVirtualPrefsReady] = useState(false);

  const sessionFromActiveId = sessions.find((session) => session.id === activeSessionId) || null;
  const activeAssistantId =
    sessionFromActiveId?.roleId || preferences.roleId || DEFAULT_PREFERENCES.roleId;
  const assistantSessions = getSessionsByAssistant(sessions, activeAssistantId);
  const activeSession =
    assistantSessions.find((session) => session.id === activeSessionId) ||
    assistantSessions[0] ||
    null;
  const activeRole = getRoleById(activeSession?.roleId || activeAssistantId);
  const memorySummary = buildMemorySummaryText(memoryItems);
  const roleBanner = activeSession ? getRoleBannerCopy(activeSession, memorySummary) : null;
  const rolePresence = activeSession ? getRolePresenceCopy(activeSession, memorySummary) : null;
  const lastMessage = activeSession?.messages?.[activeSession.messages.length - 1];
  const latestAssistantMessage = getLastAssistantMessage(activeSession?.messages || []);
  const starterPrompts = STARTER_PROMPTS[activeRole.id] || STARTER_PROMPTS.general;
  const isCloudMode = Boolean(user);
  const isRelationshipAssistant = isRelationshipAssistantId(activeAssistantId);
  const uiTheme = isRelationshipAssistant ? "romance" : "default";
  const canRegenerate = Boolean(getRegenerateRequest(activeSession));
  const activeCompanion = getCompanionProfile(
    activeSession?.companionType || preferences.companionType,
  );
  const composerPlaceholder = isRelationshipAssistant
    ? activeCompanion.id === "boyfriend"
      ? `想和${activeCompanion.name}聊聊今天的疲惫、目标，或想被怎样守护...`
      : `想和${activeCompanion.name}说说今天的心事、想念，或想被怎样温柔陪伴...`
    : activeRole?.placeholder || ROLES[0].placeholder;
  const welcomeTitle = activeRole?.welcomeTitle || "选择一个助手，然后开始聊天。";
  const welcomeDescription = activeRole?.welcomeDescription || activeRole?.description || "";
  const activeCompanionTheme = getCompanionTheme(activeCompanion.id);
  const activeEmotion = resolveEmotion(latestAssistantMessage?.emotion);
  const intimacyScore = clampScore(
    relationshipStorySnapshot?.intimacy_score,
    isRelationshipAssistant ? 68 : 52,
  );
  const moodCard = getRelationshipMoodCopy(
    activeCompanion.name,
    activeCompanion.id,
    activeEmotion,
  );
  const memoryHighlights = getMemoryHighlights(memoryItems);
  const sidebarNavigationItems = isRelationshipAssistant
    ? [
        { id: "chat", label: "聊天", description: "回到当前对话", icon: "💬" },
        { id: "memory", label: "记忆管理", description: "查看长期记忆", icon: "🧠" },
        { id: "story", label: "故事分析", description: "关系档案与故事", icon: "📖" },
        { id: "intimacy", label: "亲密度", description: "状态与亲密进度", icon: "💞" },
        { id: "emotion", label: "情绪日记", description: "今日情绪与陪伴", icon: "🌙" },
        { id: "settings", label: "设置", description: "角色与人设", icon: "⚙" },
        {
          id: "logout",
          label: user ? "退出登录" : "登录云端",
          description: user ? "切回游客模式" : "跨设备保存聊天",
          icon: user ? "↪" : "☁",
        },
      ]
    : [
        { id: "chat", label: "聊天", description: "当前对话", icon: "💬" },
        { id: "settings", label: "设置", description: "角色与偏好", icon: "⚙" },
        {
          id: "logout",
          label: user ? "退出登录" : "登录云端",
          description: user ? "切回游客模式" : "跨设备保存聊天",
          icon: user ? "↪" : "☁",
        },
      ];
  const userDisplayName =
    activeSession?.userNickname?.trim() ||
    user?.email?.split("@")?.[0] ||
    "晚风与你";
  const lastUserContent = getLastUserMessage(activeSession?.messages || [])?.content || "";

  function applyState(nextState) {
    setSessions(nextState.sessions);
    setActiveSessionId(nextState.activeSessionId);
    setPreferences(nextState.preferences);
  }

  async function persistMemoryItemsToCloud(nextItems, successMessage, failureMessage) {
    if (!supabase || !user) {
      setMemoryNotice("请先登录后再同步云端记忆。");
      return false;
    }

    try {
      await upsertCloudMemoryItems(supabase, user.id, nextItems);
      if (successMessage) {
        setMemoryNotice(successMessage);
      }
      return true;
    } catch (cloudError) {
      if (isSupabaseError(cloudError)) {
        logSupabaseError("保存云端记忆失败:", cloudError);
      } else {
        console.error("保存云端记忆失败:", cloudError?.message || cloudError);
      }
      setMemoryNotice(getCloudSyncMessage(cloudError, failureMessage || "云端记忆保存失败，请稍后重试。"));
      return false;
    }
  }

  useEffect(() => {
    setHasMounted(true);
    installClientErrorDiagnostics();

    const longWaitTimer = window.setTimeout(() => {
      setBootLongWait(true);
    }, 8000);

    return () => {
      window.clearTimeout(longWaitTimer);
    };
  }, []);

  useEffect(() => {
    setVirtualCompanionPrefs(loadVirtualCompanionPrefs());
    setVirtualPrefsReady(true);
  }, []);

  useEffect(() => {
    return () => {
      speechAudioRef.current?.pause();
      if (speechAudioUrlRef.current) {
        URL.revokeObjectURL(speechAudioUrlRef.current);
      }
      speechAudioRef.current = null;
      speechAudioUrlRef.current = "";
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
    activeSessionIdRef.current = activeSessionId;
  }, [sessions, activeSessionId]);

  useEffect(() => {
    guestMemoryRef.current = memoryItems;
  }, [memoryItems]);

  useEffect(() => {
    if (!virtualPrefsReady) {
      return;
    }

    saveVirtualCompanionPrefs(virtualCompanionPrefs);
  }, [virtualCompanionPrefs, virtualPrefsReady]);

  useEffect(() => {
    let disposed = false;
    const apiBaseUrlIssue = getApiBaseUrlIssue();
    const startupTimer = window.setTimeout(() => {
      if (disposed) {
        return;
      }

      const fallbackState = createInitialChatState();
      guestStateRef.current = fallbackState;
      guestMemoryRef.current = [];
      applyState(fallbackState);
      setMemoryItems([]);
      setStartupError("初始化超时，已进入游客模式。手机 Safari 可打开控制台查看 window.__CHAOHUAXISHI_DEBUG__。");
      setSyncNotice("本地会话加载超时，当前先使用新的游客会话。");
      setIsReady(true);
    }, 8000);

    let guestState = createInitialChatState();
    let guestMemories = [];

    try {
      guestState = loadChatState();
      guestMemories = loadLocalMemoryItems();
      const storageError = getLocalChatStorageError();

      guestStateRef.current = guestState;
      guestMemoryRef.current = guestMemories;
      applyState(guestState);
      setMemoryItems(guestMemories);
      if (storageError) {
        setStartupNeedsRecovery(true);
        setStartupError("本地会话加载失败，已自动进入新的游客会话。");
        setSyncNotice("可能是浏览器缓存异常导致。你可以清空缓存后重新进入。");
      }
      if (apiBaseUrlIssue) {
        setSyncNotice(apiBaseUrlIssue);
      }
    } catch (bootError) {
      console.error("初始化本地会话失败:", bootError);
      setStartupNeedsRecovery(true);
      setStartupError("本地会话初始化失败，已进入新的游客会话。");
      setSyncNotice("本地存储读取失败，当前先使用新的游客会话。");
      guestStateRef.current = guestState;
      guestMemoryRef.current = guestMemories;
      applyState(guestState);
      setMemoryItems(guestMemories);
    } finally {
      window.clearTimeout(startupTimer);
      setIsReady(true);
      setBootLongWait(false);
    }

    if (!supabase) {
      return () => {
        disposed = true;
        window.clearTimeout(startupTimer);
      };
    }

    const hydrateAuthenticatedUser = async (nextUser, guestStateSnapshot, guestMemoriesSnapshot) => {
      setUser(nextUser);
      setAuthError("");

      try {
        if (hasMeaningfulGuestData(guestStateSnapshot)) {
          const pendingSessions = getGuestSessionsNeedingSync(nextUser.id, guestStateSnapshot);
          if (pendingSessions.length) {
            setSyncNotice("正在同步游客聊天记录到云端...");
            await syncGuestSessionsToCloud(supabase, nextUser.id, pendingSessions);
            markGuestSessionsSynced(nextUser.id, pendingSessions);
            setSyncNotice("已将游客聊天记录同步到云端。");
          }
        }

        if (guestMemoriesSnapshot.length) {
          setMemoryNotice("正在同步游客记忆到云端...");
          await upsertCloudMemoryItems(supabase, nextUser.id, guestMemoriesSnapshot);
        }

        const cloudState = await loadCloudChatState(
          supabase,
          nextUser.id,
          guestStateSnapshot.preferences || DEFAULT_PREFERENCES,
        );
        const cloudMemories = await loadCloudMemoryItems(supabase, nextUser.id);

        if (!disposed) {
          applyState(cloudState);
          setMemoryItems(cloudMemories);
          setSyncNotice((current) => current || "当前聊天记录正在使用云端同步。");
          setMemoryNotice(
            cloudMemories.length
              ? "已加载云端记忆，你可以继续编辑或删除。"
              : "当前还没有云端记忆，可以导入微信聊天记录。",
          );
        }
      } catch (syncError) {
        if (isSupabaseError(syncError)) {
          logSupabaseError("同步云端数据失败:", syncError);
        } else {
          console.error("同步云端数据失败:", syncError?.message || syncError);
        }
        if (!disposed) {
          setSyncNotice(
            getCloudSyncMessage(syncError, "数据同步失败，当前先继续使用本地聊天记录。"),
          );
          setMemoryNotice(
            getCloudSyncMessage(syncError, "记忆同步失败，当前先继续使用本地记忆。"),
          );
          setMemoryItems(guestMemoriesSnapshot);
        }
      }
    };

    async function bootstrapAuth() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          logSupabaseError("读取登录状态失败:", sessionError);
        }

        if (disposed) {
          return;
        }

        if (data.session?.user) {
          await hydrateAuthenticatedUser(
            data.session.user,
            guestStateRef.current,
            guestMemoryRef.current,
          );
        }
      } catch (authError) {
        console.error("读取登录状态异常:", authError);
        if (!disposed) {
          setSyncNotice("登录状态读取失败，当前先使用游客模式。");
        }
      }
    }

    bootstrapAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) {
        return;
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setAuthError("");
        setSyncNotice("已切换为游客模式，聊天记录仅保存在当前浏览器。");
        setMemoryNotice("已切换为游客模式，记忆仅保存在当前浏览器。");
        const nextGuestState = loadChatState();
        const nextGuestMemories = loadLocalMemoryItems();
        guestStateRef.current = nextGuestState;
        guestMemoryRef.current = nextGuestMemories;
        applyState(nextGuestState);
        setMemoryItems(nextGuestMemories);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        void hydrateAuthenticatedUser(session.user, guestStateRef.current, guestMemoryRef.current);
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!isReady || isCloudMode) {
      return;
    }

    const guestState = {
      sessions,
      activeSessionId,
      preferences,
    };
    saveChatState(guestState);
    guestStateRef.current = guestState;
  }, [sessions, activeSessionId, preferences, isReady, isCloudMode]);

  useEffect(() => {
    if (!isReady || isCloudMode) {
      return;
    }

    saveLocalMemoryItems(memoryItems);
    guestMemoryRef.current = memoryItems;
  }, [memoryItems, isReady, isCloudMode]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    bottomAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [
    isReady,
    activeSessionId,
    activeSession?.messages.length,
    lastMessage?.content,
    isStreaming,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (isRelationshipAssistant) {
      document.title = `朝花夕拾 AI伴侣 · ${activeCompanion.name}`;
      return;
    }

    document.title = `朝花夕拾 ${activeRole.label}`;
  }, [activeCompanion.name, activeRole.label, isRelationshipAssistant]);

  useEffect(() => {
    let disposed = false;

    if (!isRelationshipAssistant || !supabase || !user) {
      setRelationshipStorySnapshot(null);
      return undefined;
    }

    async function hydrateRelationshipStory() {
      try {
        const story = await loadRelationshipStory(supabase, user.id, activeAssistantId);
        if (!disposed) {
          setRelationshipStorySnapshot(story);
        }
      } catch (storyError) {
        if (disposed) {
          return;
        }

        if (isSupabaseSchemaMissingError(storyError)) {
          setRelationshipStorySnapshot(null);
          return;
        }

        if (isSupabaseError(storyError)) {
          logSupabaseError("读取 relationship story 摘要失败:", storyError);
        } else {
          console.error("读取 relationship story 摘要失败:", storyError?.message || storyError);
        }

        setRelationshipStorySnapshot(null);
      }
    }

    void hydrateRelationshipStory();

    return () => {
      disposed = true;
    };
  }, [activeAssistantId, isRelationshipAssistant, supabase, user]);

  async function persistSessionToCloud(session, options = {}) {
    if (!supabase) {
      setSyncNotice("Supabase 未配置，当前无法同步云端聊天记录。");
      return false;
    }

    if (!user) {
      setSyncNotice("请先登录");
      return false;
    }

    try {
      if (options.metadataOnly) {
        await upsertConversationMetadata(supabase, user.id, session);
      } else {
        await syncConversationToCloud(supabase, user.id, session);
      }

      if (options.successMessage) {
        setSyncNotice(options.successMessage);
      }
      return true;
    } catch (cloudError) {
      if (isSupabaseError(cloudError)) {
        logSupabaseError("保存云端聊天记录失败:", cloudError);
      } else {
        console.error("保存云端聊天记录失败:", cloudError?.message || cloudError);
      }
      setSyncNotice(
        getCloudSyncMessage(cloudError, options.failureMessage || "云端保存失败，请稍后重试。"),
      );
      return false;
    }
  }

  function patchActiveSession(patch) {
    if (!activeSession) {
      return null;
    }

    const nextSession = {
      ...activeSession,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    setSessions((current) =>
      current.map((session) => (session.id === activeSession.id ? nextSession : session)),
    );

    return nextSession;
  }

  function focusAssistant(assistantId) {
    const resolvedAssistantId = assistantId || DEFAULT_PREFERENCES.roleId;
    const existingSessions = getSessionsByAssistant(sessionsRef.current, resolvedAssistantId);

    setActiveNavigationKey("chat");
    setPreferences((current) => ({
      ...current,
      roleId: resolvedAssistantId,
    }));

    if (existingSessions.length) {
      setActiveSessionId(existingSessions[0].id);
      setComposer("");
      setSelectedImage(null);
      setError("");
      setLastFailedRequest(null);
      setIsSidebarOpen(false);
      return;
    }

    const nextSession = createSession({
      ...preferences,
      roleId: resolvedAssistantId,
    });

    setSessions((current) => [nextSession, ...current]);
    setActiveSessionId(nextSession.id);
    setComposer("");
    setSelectedImage(null);
    setError("");
    setLastFailedRequest(null);
    setIsSidebarOpen(false);

    if (isCloudMode) {
      void persistSessionToCloud(nextSession, {
        metadataOnly: true,
        successMessage: `${getRoleById(resolvedAssistantId).label} 会话已保存到云端。`,
        failureMessage: "助手会话已创建，但云端保存失败。",
      });
    }
  }

  function updateSessionSettings(patch) {
    const nextSession = patchActiveSession(patch);
    if (!nextSession) {
      return;
    }

    setPreferences((current) => ({
      ...current,
      ...patch,
    }));

    if (isCloudMode) {
      void persistSessionToCloud(nextSession, {
        metadataOnly: true,
        failureMessage: "云端会话设置更新失败，请稍后重试。",
      });
    }
  }

  function handleCreateSession() {
    const baseSettings = activeSession
      ? createSessionPayload(activeSession)
      : {
          roleId: activeAssistantId,
          companionType: preferences.companionType,
          userNickname: preferences.userNickname,
          girlfriendStyleId: preferences.girlfriendStyleId,
          customPersona: preferences.customPersona,
        };
    const nextSession = createSession(baseSettings);

    setSessions((current) => [nextSession, ...current]);
    setActiveSessionId(nextSession.id);
    setComposer("");
    setSelectedImage(null);
    setError("");
    setLastFailedRequest(null);
    setIsSidebarOpen(false);

    if (isCloudMode) {
      void persistSessionToCloud(nextSession, {
        metadataOnly: true,
        successMessage: "新会话已保存到云端。",
        failureMessage: "新会话创建成功，但保存到云端失败。",
      });
    }
  }

  function handleDeleteSession(sessionId) {
    if (isStreaming) {
      return;
    }

    const deletingSession = sessions.find((session) => session.id === sessionId);
    const remaining = sessions.filter((session) => session.id !== sessionId);
    const remainingAssistantSessions = getSessionsByAssistant(
      remaining,
      deletingSession?.roleId || activeAssistantId,
    );

    if (sessions.length === 1) {
      const fallbackState = createInitialChatState(preferences);
      applyState(fallbackState);
      setComposer("");
      setSelectedImage(null);
      setLastFailedRequest(null);
      setIsSidebarOpen(false);

      if (isCloudMode) {
        void deleteConversationFromCloud(supabase, user.id, sessionId).catch((cloudError) => {
          if (isSupabaseError(cloudError)) {
            logSupabaseError("删除云端会话失败:", cloudError);
          } else {
            console.error("删除云端会话失败:", cloudError?.message || cloudError);
          }
          setSyncNotice(getCloudSyncMessage(cloudError, "云端删除失败，请稍后刷新重试。"));
        });
      }
      return;
    }

    if (deletingSession && !remainingAssistantSessions.length) {
      const replacementSession = createSession({
        ...preferences,
        roleId: deletingSession.roleId,
      });
      setSessions([replacementSession, ...remaining]);
      setActiveSessionId(replacementSession.id);
      setComposer("");
      setSelectedImage(null);
      setLastFailedRequest(null);

      if (isCloudMode) {
        void persistSessionToCloud(replacementSession, {
          metadataOnly: true,
          failureMessage: "已创建新的助手会话，但云端保存失败。",
        });
      }
    } else {
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId((remainingAssistantSessions[0] || remaining[0]).id);
        setComposer("");
        setSelectedImage(null);
        setLastFailedRequest(null);
      }
    }
    setIsSidebarOpen(false);

    if (isCloudMode) {
      void deleteConversationFromCloud(supabase, user.id, sessionId).catch((cloudError) => {
        if (isSupabaseError(cloudError)) {
          logSupabaseError("删除云端会话失败:", cloudError);
        } else {
          console.error("删除云端会话失败:", cloudError?.message || cloudError);
        }
        setSyncNotice(getCloudSyncMessage(cloudError, "云端删除失败，请稍后刷新重试。"));
      });
    }
  }

  function handleSelectSession(sessionId) {
    if (isStreaming) {
      return;
    }

    stopSpeechPlayback();
    const nextSession = sessions.find((session) => session.id === sessionId);
    setActiveNavigationKey("chat");
    setActiveSessionId(sessionId);
    if (nextSession?.roleId) {
      setPreferences((current) => ({
        ...current,
        roleId: nextSession.roleId,
      }));
    }
    setComposer("");
    setSelectedImage(null);
    setError("");
    setIsSidebarOpen(false);
  }

  function scrollToSection(sectionKey) {
    if (typeof document === "undefined") {
      return;
    }

    const targetId = SECTION_IDS[sectionKey];
    const element = targetId ? document.getElementById(targetId) : null;
    if (!element) {
      return;
    }

    setActiveNavigationKey(sectionKey);
    setIsSidebarOpen(false);

    const offset = window.innerWidth <= 980 ? 84 : 24;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({
      top,
      behavior: "smooth",
    });
  }

  function handleNavigateSurface(sectionKey) {
    if (sectionKey === "logout") {
      setIsSidebarOpen(false);
      if (user) {
        void handleLogout();
      } else {
        setAuthMode("login");
        setAuthError("");
        setAuthModalOpen(true);
      }
      return;
    }

    scrollToSection(sectionKey);
  }

  function handleRoleChange(roleId) {
    focusAssistant(roleId);
  }

  function handleCompanionTypeChange(companionType) {
    updateSessionSettings({ companionType });
  }

  function handleNicknameChange(userNickname) {
    updateSessionSettings({ userNickname });
  }

  function handleStyleChange(girlfriendStyleId) {
    updateSessionSettings({ girlfriendStyleId });
  }

  function handlePersonaChange(customPersona) {
    updateSessionSettings({ customPersona });
  }

  async function handleCopy(content, messageId) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(""), 1600);
    } catch (copyError) {
      console.error("复制失败:", copyError);
    }
  }

  function stopSpeechPlayback({ invalidate = true } = {}) {
    if (invalidate) {
      speechRequestTokenRef.current += 1;
    }

    speechAudioRef.current?.pause();
    if (speechAudioRef.current) {
      speechAudioRef.current.currentTime = 0;
    }
    if (speechAudioUrlRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
    }
    speechAudioRef.current = null;
    speechAudioUrlRef.current = "";
    setPlayingSpeechMessageId("");
    setSpeechLoadingMessageId("");
  }

  async function handlePlaySpeech(message) {
    if (!message?.id || !message.content) {
      return;
    }

    if (
      playingSpeechMessageId === message.id ||
      speechLoadingMessageId === message.id
    ) {
      stopSpeechPlayback();
      return;
    }

    const speechText = normalizeSpeechText(message.content);
    if (!speechText) {
      setError("这条回复暂无可朗读的文字。");
      return;
    }

    stopSpeechPlayback();
    const speechRequestToken = speechRequestTokenRef.current + 1;
    speechRequestTokenRef.current = speechRequestToken;
    setSpeechLoadingMessageId(message.id);
    setError("");

    try {
      const speechCompanionType = getCompanionProfile(
        message.companionType || activeSession?.companionType || activeCompanion.id,
      ).id;
      const response = await fetch(buildApiUrl("/api/text-to-speech"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: speechText,
          role: speechCompanionType,
          companionType: speechCompanionType,
        }),
      });

      if (!response.ok) {
        await response.json().catch(() => null);
        setError("语音生成失败，请稍后重试或检查声音配置。");
        stopSpeechPlayback({ invalidate: false });
        return;
      }

      const audioBlob = await response.blob();
      if (speechRequestTokenRef.current !== speechRequestToken) {
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      speechAudioRef.current = audio;
      speechAudioUrlRef.current = audioUrl;

      audio.onended = () => {
        stopSpeechPlayback({ invalidate: false });
      };
      audio.onerror = () => {
        stopSpeechPlayback({ invalidate: false });
        setError("语音生成失败，请稍后重试或检查声音配置。");
      };

      await audio.play();
      if (speechRequestTokenRef.current !== speechRequestToken) {
        audio.pause();
        URL.revokeObjectURL(audioUrl);
        return;
      }

      setPlayingSpeechMessageId(message.id);
    } catch (speechError) {
      console.warn("AI 语音播放失败:", speechError?.message || speechError);
      setError("语音生成失败，请稍后重试或检查声音配置。");
      stopSpeechPlayback();
    } finally {
      setSpeechLoadingMessageId((current) =>
        current === message.id ? "" : current,
      );
    }
  }

  async function handleAuthSubmit({ mode, email, password }) {
    if (!supabase) {
      setAuthError("Supabase 未配置，当前只能使用游客模式。");
      return { ok: false };
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          return {
            ok: true,
            successMessage:
              "注册成功，请去邮箱查收验证邮件并完成确认；确认后回到这里直接登录即可。",
          };
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }
      }

      setAuthModalOpen(false);
      return { ok: true };
    } catch (authRequestError) {
      const message = authRequestError?.message || "";
      if (isExpectedAuthError(message)) {
        console.warn(`认证提示: ${formatSupabaseErrorMessage(authRequestError)}`);
      } else if (isSupabaseError(authRequestError)) {
        logSupabaseError("登录或注册失败:", authRequestError);
      } else {
        console.error("登录或注册失败:", authRequestError?.message || authRequestError);
      }
      setAuthError(mapAuthErrorMessage(message, mode));
      return { ok: false };
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
    } catch (logoutError) {
      if (isSupabaseError(logoutError)) {
        logSupabaseError("退出登录失败:", logoutError);
      } else {
        console.error("退出登录失败:", logoutError?.message || logoutError);
      }
      setAuthError(logoutError?.message || "退出登录失败，请稍后重试。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleImportChatRecord(file) {
    if (isStreaming || memoryLoading) {
      return;
    }

    const confirmed = window.confirm(
      "聊天记录可能包含隐私，请确认你有权上传，并建议先删除敏感内容。是否继续导入？",
    );
    if (!confirmed) {
      return;
    }

    setMemoryLoading(true);
    setMemoryNotice("正在解析并总结聊天记录...");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(buildApiUrl("/api/import-chat-record"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = await response.json();
      const nextItems = mergeMemoryItems(memoryItems, payload.memoryItems || []);

      setMemoryItems(nextItems);

      if (isCloudMode) {
        await persistMemoryItemsToCloud(
          nextItems,
          "聊天记录已导入，并同步到云端记忆。",
          "聊天记录已导入，但云端记忆保存失败。",
        );
      } else {
        saveLocalMemoryItems(nextItems);
        setMemoryNotice("聊天记录已导入，记忆已保存在当前浏览器。");
      }
    } catch (importError) {
      console.error("导入聊天记录失败:", importError);
      setMemoryNotice(importError.message || "导入聊天记录失败，请稍后重试。");
    } finally {
      setMemoryLoading(false);
    }
  }

  function handleMemoryFieldChange(memoryType, content) {
    const existingItem = memoryItems.find((item) => item.memoryType === memoryType);
    const nextItems = upsertMemoryItem(memoryItems, {
      id: existingItem?.id,
      memoryType,
      content,
      source: content.trim() ? "manual" : existingItem?.source || "manual",
      createdAt: existingItem?.createdAt,
    });

    setMemoryItems(nextItems);

    if (isCloudMode) {
      if (!content.trim()) {
        void deleteCloudMemoryItem(supabase, user.id, memoryType)
          .then(() => setMemoryNotice("该条记忆已从云端删除。"))
          .catch((cloudError) => {
            if (isSupabaseError(cloudError)) {
              logSupabaseError("删除云端记忆失败:", cloudError);
            } else {
              console.error("删除云端记忆失败:", cloudError?.message || cloudError);
            }
            setMemoryNotice(getCloudSyncMessage(cloudError, "删除云端记忆失败，请稍后重试。"));
          });
      } else {
        void persistMemoryItemsToCloud(
          nextItems.filter((item) => item.memoryType === memoryType),
          "记忆已更新到云端。",
          "记忆已修改，但云端保存失败。",
        );
      }
    } else {
      saveLocalMemoryItems(nextItems);
      setMemoryNotice(content.trim() ? "记忆已更新到本地。" : "该条记忆已从本地删除。");
    }
  }

  function handleDeleteMemory(memoryType) {
    const nextItems = removeMemoryItem(memoryItems, memoryType);
    setMemoryItems(nextItems);

    if (isCloudMode) {
      void deleteCloudMemoryItem(supabase, user.id, memoryType)
        .then(() => setMemoryNotice("记忆已从云端删除。"))
        .catch((cloudError) => {
          if (isSupabaseError(cloudError)) {
            logSupabaseError("删除云端记忆失败:", cloudError);
          } else {
            console.error("删除云端记忆失败:", cloudError?.message || cloudError);
          }
          setMemoryNotice(getCloudSyncMessage(cloudError, "删除云端记忆失败，请稍后重试。"));
        });
    } else {
      saveLocalMemoryItems(nextItems);
      setMemoryNotice("记忆已从本地删除。");
    }
  }

  function handleClearMemories() {
    if (!memoryItems.length) {
      return;
    }

    const confirmed = window.confirm("确定要删除当前保存的所有记忆吗？");
    if (!confirmed) {
      return;
    }

    setMemoryItems([]);

    if (isCloudMode) {
      void clearCloudMemoryItems(supabase, user.id)
        .then(() => setMemoryNotice("已清空云端记忆。"))
        .catch((cloudError) => {
          if (isSupabaseError(cloudError)) {
            logSupabaseError("清空云端记忆失败:", cloudError);
          } else {
            console.error("清空云端记忆失败:", cloudError?.message || cloudError);
          }
          setMemoryNotice(getCloudSyncMessage(cloudError, "清空云端记忆失败，请稍后重试。"));
        });
    } else {
      clearLocalMemoryItems();
      setMemoryNotice("已清空本地记忆。");
    }
  }

  async function handlePickImage(file) {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError("仅支持上传 jpg / png / webp 图片。");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("图片过大，请控制在 4MB 以内。");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSelectedImage({
        id: `image_${Date.now()}`,
        type: "image",
        name: file.name,
        mimeType: file.type,
        dataUrl,
      });
      setError("");
    } catch (readError) {
      setError(readError.message || "读取图片失败，请重试。");
    }
  }

  function handleRemoveImage() {
    setSelectedImage(null);
  }

  async function handleClearChat() {
    if (!activeSession || isStreaming) {
      return;
    }

    const confirmed = window.confirm("确定要清空当前会话的聊天内容吗？角色设置和会话本身会保留。");
    if (!confirmed) {
      return;
    }

    stopSpeechPlayback();
    const clearedSession = {
      ...activeSession,
      title: "新对话",
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    setSessions((current) =>
      current.map((session) => (session.id === activeSession.id ? clearedSession : session)),
    );
    setComposer("");
    setSelectedImage(null);
    setError("");
    setLastFailedRequest(null);
    setCopiedMessageId("");
    setSyncNotice(isCloudMode ? "已清空当前会话，正在同步到云端..." : "已清空当前会话。");

    if (isCloudMode) {
      await persistSessionToCloud(clearedSession, {
        successMessage: "当前会话已清空并同步到云端。",
        failureMessage: "当前会话已清空，但云端同步失败，请稍后重试。",
      });
    }
  }

  async function streamReply({ retry = false, regenerate = false } = {}) {
    if (isStreaming) {
      return;
    }

    const currentSessionId = activeSessionIdRef.current;
    const currentSession = sessionsRef.current.find((session) => session.id === currentSessionId);

    if (!currentSession) {
      return;
    }

    const regenerateRequest = regenerate ? getRegenerateRequest(currentSession) : null;
    const messageText = retry
      ? lastFailedRequest?.content || ""
      : regenerateRequest?.content ?? composer.trim();
    const pendingImage = retry
      ? lastFailedRequest?.attachment || null
      : regenerateRequest?.attachment ?? selectedImage;
    const imageUrl = getAttachmentUrl(pendingImage);
    const hasImage = Boolean(imageUrl);

    if (!messageText && !hasImage) {
      return;
    }

    const visibleMessageText = messageText || (hasImage ? "请看看这张图片" : "");
    const currentCompanion = getCompanionProfile(currentSession.companionType);
    const userMessage = retry || regenerate
      ? null
      : createMessage("user", visibleMessageText, {
          attachments: hasImage ? [pendingImage] : [],
        });
    const assistantMessage = createMessage("assistant", "", {
      companionType: currentSession.companionType,
      companionName: currentCompanion.name,
      emotion: "normal",
    });
    const requestMessages = retry
      ? currentSession.messages
      : regenerateRequest
        ? regenerateRequest.messages
      : [...currentSession.messages, userMessage];
    const nextTitle = deriveSessionTitle(requestMessages);

    setSessions((current) =>
      current.map((session) =>
        session.id === currentSessionId
          ? {
              ...session,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
              messages: [...requestMessages, assistantMessage],
            }
          : session,
      ),
    );
    setComposer("");
    setSelectedImage(null);
    setError("");
    setIsStreaming(true);
    setLastFailedRequest(null);
    setSyncNotice((current) => current || "正在生成回复...");

    streamRuntimeRef.current = {
      fullReply: "",
      responseCompanionType: currentSession.companionType,
      responseCompanionName: currentCompanion.name,
      responseEmotion: "normal",
    };

    try {
      const endpoint = hasImage ? buildApiUrl("/api/image-chat") : buildApiUrl("/api/chat");
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await getAuthorizedJsonHeaders(supabase),
        signal: controller.signal,
        body: JSON.stringify({
          ...createSessionPayload(currentSession),
          memorySummary,
          messages: toApiMessages(requestMessages),
          ...(hasImage
            ? {
                userText: messageText,
                image: {
                  ...pendingImage,
                  url: imageUrl,
                },
              }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      if (!response.body) {
        throw new Error("AI 服务未返回可读取的数据流。");
      }

      const responseCompanionType =
        response.headers.get("X-Companion-Type") || currentSession.companionType;
      const responseCompanionName =
        decodeHeaderValue(response.headers.get("X-Companion-Name")) ||
        getCompanionProfile(responseCompanionType).name;
      const responseEmotion = resolveEmotion(response.headers.get("X-Emotion"));
      streamRuntimeRef.current = {
        fullReply: "",
        responseCompanionType,
        responseCompanionName,
        responseEmotion,
      };
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const fullReply = `${streamRuntimeRef.current?.fullReply || ""}${decoder.decode(value, {
          stream: true,
        })}`;
        streamRuntimeRef.current = {
          ...streamRuntimeRef.current,
          fullReply,
        };
        setSessions((current) =>
          current.map((session) =>
            session.id === currentSessionId
              ? {
                  ...session,
                  updatedAt: new Date().toISOString(),
                  messages: session.messages.map((message) =>
                    message.id === assistantMessage.id
                      ? {
                          ...message,
                          content: fullReply,
                          emotion: streamRuntimeRef.current?.responseEmotion || "normal",
                        }
                      : message,
                  ),
                }
              : session,
          ),
        );
      }

      const streamSnapshot = streamRuntimeRef.current || {
        fullReply: "",
        responseCompanionType: currentSession.companionType,
        responseCompanionName: currentCompanion.name,
        responseEmotion: "normal",
      };
      const finalEmotion = resolveEmotion(
        streamSnapshot.responseEmotion,
        inferEmotionFromText(streamSnapshot.fullReply),
      );

      const finalSession = {
        ...currentSession,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: [
          ...requestMessages,
          {
            ...assistantMessage,
            companionType: streamSnapshot.responseCompanionType,
            companionName: streamSnapshot.responseCompanionName,
            emotion: finalEmotion,
            content: streamSnapshot.fullReply || "……",
          },
        ],
      };

      setSessions((current) =>
        current.map((session) => (session.id === currentSessionId ? finalSession : session)),
      );

      if (isCloudMode) {
        await persistSessionToCloud(finalSession, {
          successMessage: "聊天记录已同步到云端。",
          failureMessage: "聊天成功，但云端保存失败，请稍后重试。",
        });
      } else {
        setSyncNotice("当前为游客模式，聊天记录已保存在本地。");
      }
    } catch (streamError) {
      const isAbortError = streamError?.name === "AbortError";
      const streamSnapshot = streamRuntimeRef.current || {
        fullReply: "",
        responseCompanionType: currentSession.companionType,
        responseCompanionName: currentCompanion.name,
        responseEmotion: "normal",
      };
      if (isAbortError) {
        const stoppedSession = {
          ...currentSession,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
          messages: streamSnapshot.fullReply
            ? [
                ...requestMessages,
                {
                  ...assistantMessage,
                  companionType: streamSnapshot.responseCompanionType,
                  companionName: streamSnapshot.responseCompanionName,
                  emotion: streamSnapshot.responseEmotion,
                  content: streamSnapshot.fullReply,
                },
              ]
            : requestMessages,
        };

        setSessions((current) =>
          current.map((session) => (session.id === currentSessionId ? stoppedSession : session)),
        );

        if (isCloudMode) {
          await persistSessionToCloud(stoppedSession, {
            successMessage: "已停止生成，当前内容已同步到云端。",
            failureMessage: "已停止生成，但云端保存失败，请稍后重试。",
          });
        } else {
          setSyncNotice("已停止生成，当前内容保存在本地。");
        }
        return;
      }

      console.error("聊天请求失败:", streamError);
      const failureMessage =
        streamError.message ||
        "网络异常，请稍后重试。";
      const visibleErrorMessage = formatChatFailureMessage(failureMessage);
      const failedSession = {
        ...currentSession,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: [
          ...requestMessages,
          {
            ...assistantMessage,
            companionType: streamSnapshot.responseCompanionType,
            companionName: streamSnapshot.responseCompanionName,
            emotion: "sad",
            content: visibleErrorMessage,
          },
        ],
      };

      setSessions((current) =>
        current.map((session) => (session.id === currentSessionId ? failedSession : session)),
      );

      if (isCloudMode) {
        await persistSessionToCloud(failedSession, {
          failureMessage: "消息已保留，但云端保存失败，请稍后重试。",
        });
      }

      setLastFailedRequest({
        sessionId: currentSessionId,
        content: messageText,
        attachment: pendingImage,
      });
      setError(failureMessage);
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleRetry() {
    if (!lastFailedRequest || lastFailedRequest.sessionId !== activeSessionId) {
      return;
    }
    streamReply({ retry: true });
  }

  function handleStopStreaming() {
    abortControllerRef.current?.abort();
  }

  function handleRegenerate() {
    streamReply({ regenerate: true });
  }

  function handleClearLocalCacheAndReload() {
    clearLocalChatStorage();
    clearLocalMemoryItems();
    try {
      window.localStorage?.removeItem("chat_sessions");
      window.localStorage?.removeItem("active_session_id");
      window.localStorage?.removeItem("chat_messages");
    } catch (clearError) {
      console.warn("清空兼容缓存失败:", clearError);
    }
    window.location.reload();
  }

  if (!hasMounted) {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <div className="loading-card">
            <p className="eyebrow">朝花夕拾 AI 伴侣</p>
            <h1>正在载入你的会话...</h1>
            <LoadingDots />
            <small>如果手机端长时间停在这里，请刷新或清空本地缓存后重新进入。</small>
          </div>
        </div>
      </main>
    );
  }

  if (!isReady) {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <div className="loading-card">
            <p className="eyebrow">朝花夕拾 AI 伴侣</p>
            <h1>正在载入你的会话...</h1>
            <LoadingDots />
            <small>
              {bootLongWait
                ? "加载时间较长，可尝试清空本地缓存。"
                : "正在准备聊天界面。"}
            </small>
            {bootLongWait ? (
              <GradientButton onClick={handleClearLocalCacheAndReload} theme={uiTheme}>
                清空缓存并重新进入
              </GradientButton>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main
        className={`app-shell${uiTheme === "romance" ? " app-shell-romance" : ""}`}
        data-companion={activeCompanion.id}
      >
        <SessionSidebar
          assistants={ROLES}
          activeAssistantId={activeAssistantId}
          sessions={assistantSessions}
          activeSessionId={activeSessionId}
          disabled={isStreaming}
          mobileOpen={isSidebarOpen}
          navigationItems={sidebarNavigationItems}
          activeNavigationKey={activeNavigationKey}
          user={user}
          supabaseEnabled={Boolean(supabase)}
          userDisplayName={userDisplayName}
          activeCompanion={activeCompanion}
          intimacyScore={intimacyScore}
          onNavigate={handleNavigateSurface}
          onAuthAction={() => {
            setAuthMode("login");
            setAuthError("");
            setAuthModalOpen(true);
          }}
          onLogout={handleLogout}
          onClose={() => setIsSidebarOpen(false)}
          onSelectAssistant={focusAssistant}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
          onSelect={handleSelectSession}
        />

        <section className="chat-panel" data-theme={uiTheme} data-companion={activeCompanion.id}>
          <AssistantHeader
            activeRole={activeRole}
            activeSession={activeSession}
            welcomeDescription={welcomeDescription}
            isStreaming={isStreaming}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            user={user}
            supabaseEnabled={Boolean(supabase)}
            authLoading={authLoading}
            onOpenAuth={() => {
              setAuthMode("login");
              setAuthError("");
              setAuthModalOpen(true);
            }}
            onLogout={handleLogout}
            rolePresence={rolePresence}
            roleBanner={roleBanner}
            syncNotice={syncNotice}
            isCloudMode={isCloudMode}
            activeCompanion={activeCompanion}
            theme={uiTheme}
          />

          {error ? (
            <GlassCard className="error-banner" compact theme={uiTheme}>
              <strong>{error}</strong>
              <span>控制台会输出详细错误，页面只保留简洁提示。</span>
            </GlassCard>
          ) : null}

          {!isReady ? (
            <GlassCard className="status-banner" compact theme={uiTheme}>
              <strong>正在载入本地会话...</strong>
              <span>页面已先进入可用状态；如果本地记录可读，会在后台继续恢复。</span>
            </GlassCard>
          ) : null}

          {startupError ? (
            <GlassCard className="error-banner" compact theme={uiTheme}>
              <strong>{startupError}</strong>
              <span>
                {startupNeedsRecovery
                  ? "可能是浏览器缓存异常导致。"
                  : "页面已进入可用状态；如果要继续排查手机问题，可查看浏览器控制台里的调试对象。"}
              </span>
              {startupNeedsRecovery ? (
                <GradientButton
                  variant="secondary"
                  size="sm"
                  onClick={handleClearLocalCacheAndReload}
                  theme={uiTheme}
                >
                  清空缓存并重新进入
                </GradientButton>
              ) : null}
            </GlassCard>
          ) : null}

          <div className="chat-experience-layout">
            <div className="chat-primary-column">
              <section id={SECTION_IDS.settings}>
                <RoleSettings
                  roleId={activeSession?.roleId || preferences.roleId}
                  companionType={activeSession?.companionType || preferences.companionType}
                  userNickname={activeSession?.userNickname || ""}
                  girlfriendStyleId={activeSession?.girlfriendStyleId || GIRLFRIEND_STYLES[0].id}
                  customPersona={activeSession?.customPersona || ""}
                  disabled={isStreaming || memoryLoading}
                  onRoleChange={handleRoleChange}
                  onCompanionTypeChange={handleCompanionTypeChange}
                  onNicknameChange={handleNicknameChange}
                  onStyleChange={handleStyleChange}
                  onPersonaChange={handlePersonaChange}
                />
              </section>

              <GlassCard className="chat-thread-card" theme={uiTheme} id={SECTION_IDS.chat}>
                <div className="chat-thread-card-head">
                  <div>
                    <p className="eyebrow">陪伴聊天</p>
                    <h3>{activeCompanion.label} · {activeCompanion.name}</h3>
                    <span className="chat-thread-card-tip">切换角色不会删除聊天记录，新的回复会自动沿用当前设定。</span>
                  </div>
                  <div className={`chat-thread-badge companion-${activeCompanion.id}`}>
                    <span aria-hidden="true">{activeCompanionTheme.icon}</span>
                    <strong>{activeCompanion.shortDescription}</strong>
                  </div>
                </div>

                <div className="chat-thread">
                  {activeSession?.messages.length ? (
                    <div className="chat-thread-inner">
                      {activeSession.messages.map((message) => {
                        const assistantProfile =
                          message.role === "assistant"
                            ? getAssistantMessageProfile(message, activeSession)
                            : null;
                        const bubbleCompanionType = assistantProfile?.companionType || activeCompanion.id;
                        const bubbleTheme = getCompanionTheme(bubbleCompanionType);

                        return (
                          <article
                            key={message.id}
                            className={`bubble-row ${message.role}`}
                            data-companion={bubbleCompanionType}
                          >
                            {message.role === "assistant" ? (
                              <div
                                className={`bubble-avatar ${message.role}${uiTheme === "romance" ? " is-romance" : ""}`}
                                data-companion={bubbleCompanionType}
                                aria-hidden="true"
                                title={`${assistantProfile.companionLabel} · ${assistantProfile.companionName}`}
                              >
                                {bubbleTheme.icon}
                              </div>
                            ) : (
                              <div className={`bubble-avatar ${message.role}`} aria-hidden="true">
                                你
                              </div>
                            )}

                            <div
                              className={`bubble ${message.role}`}
                              data-theme={uiTheme}
                              data-companion={bubbleCompanionType}
                            >
                              <div className="bubble-meta">
                                <div className="bubble-meta-main">
                                  <strong>
                                    {message.role === "user"
                                      ? "你"
                                      : getAssistantMessageTitle(message, activeSession)}
                                  </strong>
                                  <span>{formatMessageTime(message.createdAt) || "刚刚"}</span>
                                </div>
                                {message.role === "assistant" && message.content ? (
                                  <div className="bubble-meta-actions">
                                    <GradientButton
                                      variant="ghost"
                                      size="sm"
                                      className={`bubble-voice-button${
                                        playingSpeechMessageId === message.id ? " is-playing" : ""
                                      }`}
                                      onClick={() => handlePlaySpeech(message)}
                                      disabled={Boolean(
                                        speechLoadingMessageId &&
                                          speechLoadingMessageId !== message.id,
                                      )}
                                      theme={uiTheme}
                                      aria-label={
                                        playingSpeechMessageId === message.id
                                          ? "停止播放语音"
                                          : "播放 AI 语音"
                                      }
                                    >
                                      {speechLoadingMessageId === message.id
                                        ? "生成中"
                                        : playingSpeechMessageId === message.id
                                          ? "播放中"
                                          : "🔊"}
                                    </GradientButton>
                                    <GradientButton
                                      variant="ghost"
                                      size="sm"
                                      className="bubble-copy-button"
                                      onClick={() => handleCopy(message.content, message.id)}
                                      theme={uiTheme}
                                    >
                                      {copiedMessageId === message.id ? "已复制" : "复制"}
                                    </GradientButton>
                                  </div>
                                ) : null}
                              </div>

                              {message.attachments?.length ? (
                                <div className="bubble-image-stack">
                                  {message.attachments.map((attachment) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={attachment.id}
                                      src={getAttachmentUrl(attachment)}
                                      alt={attachment.name || "用户上传图片"}
                                      className="bubble-image"
                                    />
                                  ))}
                                </div>
                              ) : null}

                              {message.role === "assistant" && !message.content ? (
                                <div className="typing-shell">
                                  <LoadingDots theme={uiTheme} />
                                  <small>{assistantProfile?.companionName || activeCompanion.name} 正在输入...</small>
                                </div>
                              ) : message.content ? (
                                message.role === "assistant" ? (
                                  <MarkdownMessage content={message.content} />
                                ) : (
                                  <p>{message.content}</p>
                                )
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyChatState
                      roleLabel={activeRole.label}
                      welcomeTitle={welcomeTitle}
                      welcomeDescription={welcomeDescription}
                      user={user}
                      prompts={starterPrompts}
                      onPickPrompt={setComposer}
                      theme={uiTheme}
                    />
                  )}
                  <div ref={bottomAnchorRef} />
                </div>

                <MessageInput
                  value={composer}
                  disabled={isStreaming || memoryLoading}
                  canRetry={Boolean(lastFailedRequest && lastFailedRequest.sessionId === activeSessionId)}
                  canRegenerate={canRegenerate}
                  isStreaming={isStreaming}
                  imagePreview={selectedImage}
                  placeholder={composerPlaceholder}
                  companionName={activeCompanion.name}
                  theme={uiTheme}
                  onChange={setComposer}
                  onPickImage={handlePickImage}
                  onRemoveImage={handleRemoveImage}
                  onClear={handleClearChat}
                  onStop={handleStopStreaming}
                  onSubmit={() => streamReply()}
                  onRegenerate={handleRegenerate}
                  onRetry={handleRetry}
                  onSpeechError={setError}
                />
              </GlassCard>

              {isRelationshipAssistant ? (
                <GlassCard className="emotion-diary-card" theme={uiTheme} id={SECTION_IDS.emotion}>
                  <div className="section-heading emotion-diary-head">
                    <div>
                      <p className="eyebrow">情绪日记</p>
                      <h3>今天的陪伴氛围</h3>
                    </div>
                    <span className="settings-tip">
                      {virtualCompanionPrefs.voiceEnabled ? "语音朗读已开启" : "语音朗读已关闭"}
                    </span>
                  </div>

                  <div className="emotion-diary-grid">
                    <article className="emotion-diary-panel">
                      <strong>{activeCompanion.name} 当前情绪</strong>
                      <p>{moodCard.text}</p>
                    </article>
                    <article className="emotion-diary-panel">
                      <strong>上一次你说的话</strong>
                      <p>{lastUserContent || "还没有新的分享，随时都可以开口。"}</p>
                    </article>
                  </div>
                </GlassCard>
              ) : null}

              {isRelationshipAssistant ? (
                <section id={SECTION_IDS.story}>
                  <RelationshipStoryPanel
                    assistantId={activeAssistantId}
                    user={user}
                    supabase={supabase}
                    disabled={isStreaming || memoryLoading}
                  />
                </section>
              ) : null}

              {activeAssistantId === "girlfriend" ? (
                <section id={SECTION_IDS.memory}>
                  <MemoryManager
                    items={memoryItems}
                    disabled={isStreaming}
                    loading={memoryLoading}
                    storageMode={getMemoryStorageMode(user)}
                    notice={memoryNotice}
                    onImport={handleImportChatRecord}
                    onChange={handleMemoryFieldChange}
                    onDelete={handleDeleteMemory}
                    onClear={handleClearMemories}
                  />
                </section>
              ) : null}
            </div>

            <aside className="insight-panel" id={SECTION_IDS.intimacy}>
              {isRelationshipAssistant ? (
                <>
                  <GlassCard className="insight-card status-overview-card" theme={uiTheme}>
                    <div className="insight-card-head">
                      <strong>当前状态</strong>
                      <span aria-hidden="true">💗</span>
                    </div>
                    <div className="status-row">
                      <span>情绪</span>
                      <strong>{activeEmotion === "happy" ? "开心" : activeEmotion === "sad" ? "低落" : "平静"}</strong>
                    </div>
                    <div className="status-row">
                      <span>亲密度</span>
                      <strong>{intimacyScore}/100</strong>
                    </div>
                    <div className="status-progress-track" aria-hidden="true">
                      <div className="status-progress-bar" style={{ width: `${intimacyScore}%` }} />
                    </div>
                    <p className="insight-card-note">
                      {relationshipStorySnapshot?.relationship_summary || "关系故事会随着聊天与记忆慢慢更完整。"}
                    </p>
                  </GlassCard>

                  <GlassCard className={`insight-card mood-card companion-${activeCompanion.id}`} theme={uiTheme}>
                    <div className="insight-card-head">
                      <strong>{moodCard.title}</strong>
                      <span aria-hidden="true">{activeCompanionTheme.icon}</span>
                    </div>
                    <p className="insight-card-note">{moodCard.text}</p>
                    <div className={`mood-avatar companion-${activeCompanion.id}`} aria-hidden="true">
                      <span>{activeCompanionTheme.icon}</span>
                    </div>
                  </GlassCard>

                  <GlassCard className="insight-card memory-snippet-card" theme={uiTheme}>
                    <div className="insight-card-head">
                      <strong>记忆片段</strong>
                      <span aria-hidden="true">🧠</span>
                    </div>
                    <div className="memory-snippet-list">
                      {memoryHighlights.length ? (
                        memoryHighlights.map((item) => (
                          <article key={item.id} className="memory-snippet-item">
                            <span aria-hidden="true">♥</span>
                            <p>{item.content}</p>
                          </article>
                        ))
                      ) : (
                        <p className="insight-card-note">还没有记住新的偏好，导入聊天记录后这里会自动更新。</p>
                      )}
                    </div>
                    <GradientButton
                      variant="secondary"
                      size="sm"
                      onClick={() => handleNavigateSurface("memory")}
                      theme={uiTheme}
                    >
                      查看全部记忆
                    </GradientButton>
                  </GlassCard>

                  <VirtualCompanionPanel
                    sessionId={activeSession?.id || ""}
                    companionType={activeSession?.companionType || preferences.companionType}
                    latestAssistantMessage={latestAssistantMessage}
                    voicePreferences={virtualCompanionPrefs}
                    onVoicePreferencesChange={setVirtualCompanionPrefs}
                    theme={uiTheme}
                  />
                </>
              ) : (
                <GlassCard className="insight-card status-overview-card" theme={uiTheme}>
                  <div className="insight-card-head">
                    <strong>{activeRole.label}</strong>
                    <span aria-hidden="true">✨</span>
                  </div>
                  <p className="insight-card-note">
                    {user
                      ? "当前账号已连接云端，会话和设置会跟随账号同步。"
                      : "当前为游客模式，聊天记录与设置仅保存在当前浏览器。"}
                  </p>
                </GlassCard>
              )}
            </aside>
          </div>
        </section>
      </main>

      <nav
        className="mobile-bottom-nav"
        aria-label="移动端快捷导航"
        data-companion={activeCompanion.id}
      >
        {MOBILE_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mobile-bottom-nav-item${activeNavigationKey === item.id ? " active" : ""}`}
            onClick={() => handleNavigateSurface(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </nav>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        loading={authLoading}
        error={authError}
        onClose={() => setAuthModalOpen(false)}
        onSubmit={handleAuthSubmit}
      />
    </>
  );
}
