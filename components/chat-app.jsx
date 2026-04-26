"use client";

import { useEffect, useRef, useState } from "react";

import AuthModal from "@/components/auth-modal";
import LoadingDots from "@/components/loading-dots";
import MemoryManager from "@/components/memory-manager";
import MessageInput from "@/components/message-input";
import RoleSettings from "@/components/role-settings";
import SessionSidebar from "@/components/session-sidebar";
import {
  GIRLFRIEND_STYLES,
  getGirlfriendStyleById,
  getRoleById,
  getSessionRoleSummary,
} from "@/lib/chat/roles";
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
  deriveSessionTitle,
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

async function readApiError(response) {
  try {
    const payload = await response.json();
    if (payload?.code === "missing_api_key") {
      return "API Key 未配置";
    }
    if (payload?.code === "vision_not_supported") {
      return "当前模型暂不支持图片理解";
    }
    return payload?.error || "AI 服务暂时不可用，请稍后重试。";
  } catch {
    return "AI 服务暂时不可用，请稍后重试。";
  }
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

function toApiMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function createSessionPayload(session) {
  return {
    roleId: session.roleId,
    userNickname: session.userNickname,
    girlfriendStyleId: session.girlfriendStyleId,
    customPersona: session.customPersona,
  };
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
  const nickname = session?.userNickname?.trim();
  return {
    title: `AI女友 · ${style.label}`,
    description: nickname
      ? `当前会优先用“${nickname}”称呼你，并按 ${style.label} 的状态陪你聊天${memorySummary ? "，也会自然参考你导入的记忆" : ""}。`
      : `当前启用 ${style.label}，会以恋爱感、陪伴感和日常关心的方式和你聊天${memorySummary ? "，并结合已保存的记忆" : ""}。`,
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
  const nickname = session?.userNickname?.trim();
  return {
    title: nickname ? `${style.label} · 对你在线` : `AI女友 · ${style.label}`,
    status: "陪伴中",
    subtitle: nickname
      ? `会优先用“${nickname}”称呼你${memorySummary ? "，并温柔参考你分享过的偏好。" : "，像恋人一样自然陪你聊天。"}`
      : memorySummary
        ? "已开启恋爱感与陪伴感回复，也会结合你的长期偏好来聊天。"
        : "已开启恋爱感与陪伴感回复，可以在下方填写昵称和人设。",
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

export default function ChatApp() {
  const supabase = getSupabaseBrowserClient();
  const guestStateRef = useRef(createInitialChatState());
  const guestMemoryRef = useRef([]);
  const sessionsRef = useRef([]);
  const activeSessionIdRef = useRef("");
  const bottomAnchorRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [composer, setComposer] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [memoryItems, setMemoryItems] = useState([]);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [lastFailedRequest, setLastFailedRequest] = useState(null);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) || sessions[0] || null;
  const activeRole = getRoleById(activeSession?.roleId);
  const memorySummary = buildMemorySummaryText(memoryItems);
  const roleBanner = activeSession ? getRoleBannerCopy(activeSession, memorySummary) : null;
  const rolePresence = activeSession ? getRolePresenceCopy(activeSession, memorySummary) : null;
  const lastMessage = activeSession?.messages?.[activeSession.messages.length - 1];
  const starterPrompts = STARTER_PROMPTS[activeRole.id] || STARTER_PROMPTS.general;
  const isCloudMode = Boolean(user);

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
    sessionsRef.current = sessions;
    activeSessionIdRef.current = activeSessionId;
  }, [sessions, activeSessionId]);

  useEffect(() => {
    guestMemoryRef.current = memoryItems;
  }, [memoryItems]);

  useEffect(() => {
    const guestState = loadChatState();
    const guestMemories = loadLocalMemoryItems();

    guestStateRef.current = guestState;
    guestMemoryRef.current = guestMemories;
    applyState(guestState);
    setMemoryItems(guestMemories);
    setIsReady(true);

    if (!supabase) {
      return;
    }

    let disposed = false;

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
          roleId: preferences.roleId,
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

    const remaining = sessions.filter((session) => session.id !== sessionId);

    if (sessions.length === 1) {
      const fallbackState = createInitialChatState(preferences);
      applyState(fallbackState);
      setComposer("");
      setSelectedImage(null);
      setLastFailedRequest(null);

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

    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0].id);
      setComposer("");
      setSelectedImage(null);
      setLastFailedRequest(null);
    }

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

    setActiveSessionId(sessionId);
    setComposer("");
    setSelectedImage(null);
    setError("");
  }

  function handleRoleChange(roleId) {
    updateSessionSettings({ roleId });
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
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(""), 1600);
    } catch (copyError) {
      console.error("复制失败:", copyError);
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

      const response = await fetch("/api/import-chat-record", {
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

  async function streamReply({ retry = false } = {}) {
    if (isStreaming) {
      return;
    }

    const currentSessionId = activeSessionIdRef.current;
    const currentSession = sessionsRef.current.find((session) => session.id === currentSessionId);

    if (!currentSession) {
      return;
    }

    const messageText = retry ? lastFailedRequest?.content || "" : composer.trim();
    const pendingImage = retry ? lastFailedRequest?.attachment || null : selectedImage;
    const hasImage = Boolean(pendingImage?.dataUrl);

    if (!messageText && !hasImage) {
      return;
    }

    const visibleMessageText = messageText || (hasImage ? "请看看这张图片" : "");
    const userMessage = retry
      ? null
      : createMessage("user", visibleMessageText, {
          attachments: hasImage ? [pendingImage] : [],
        });
    const assistantMessage = createMessage("assistant", "");
    const requestMessages = retry
      ? currentSession.messages
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

    try {
      const endpoint = hasImage ? "/api/image-chat" : "/api/chat";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...createSessionPayload(currentSession),
          memorySummary,
          messages: toApiMessages(requestMessages),
          ...(hasImage
            ? {
                userText: messageText,
                image: pendingImage,
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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        fullReply += decoder.decode(value, { stream: true });
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
                        }
                      : message,
                  ),
                }
              : session,
          ),
        );
      }

      const finalSession = {
        ...currentSession,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: [
          ...requestMessages,
          {
            ...assistantMessage,
            content: fullReply || "……",
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
      }
    } catch (streamError) {
      console.error("聊天请求失败:", streamError);
      const failedSession = {
        ...currentSession,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: requestMessages,
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
      setError(streamError.message || "网络异常，请稍后重试。");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleRetry() {
    if (!lastFailedRequest || lastFailedRequest.sessionId !== activeSessionId) {
      return;
    }
    streamReply({ retry: true });
  }

  if (!isReady) {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <LoadingDots />
          <p>正在载入本地会话...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          disabled={isStreaming}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
          onSelect={handleSelectSession}
        />

        <section className="chat-panel">
          <header className="chat-header">
            <div className="chat-header-copy">
              <p className="eyebrow">无服务器 AI 聊天</p>
              <h2>{activeSession?.title || "新对话"}</h2>
              <span className="header-tip">
                {isStreaming ? "AI 正在回复中..." : "已就绪，可直接部署到 Vercel"}
              </span>
            </div>

            <div className="chat-meta-stack">
              <div className="auth-card">
                <div>
                  <strong>{user ? user.email : "游客模式"}</strong>
                  <span>
                    {user
                      ? "聊天记录与记忆会同步到 Supabase，可跨设备访问。"
                      : supabase
                        ? "登录后可云端保存聊天记录和记忆。"
                        : "未配置 Supabase，当前只能使用游客模式。"}
                  </span>
                </div>
                {user ? (
                  <button type="button" className="ghost-button" onClick={handleLogout} disabled={authLoading}>
                    退出
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                      setAuthModalOpen(true);
                    }}
                    disabled={!supabase}
                  >
                    登录 / 注册
                  </button>
                )}
              </div>

              <div className="chat-summary-chip chat-summary-chip-rich">
                <div className="presence-dot" />
                <div>
                  <strong>{rolePresence?.title || "通用助手"}</strong>
                  <span>{rolePresence?.subtitle || "支持会话级个性设置"}</span>
                </div>
                <em>{rolePresence?.status || "在线"}</em>
              </div>
            </div>
          </header>

          <div className="role-banner role-banner-romance">
            <strong>{roleBanner?.title}</strong>
            <p>{roleBanner?.description}</p>
          </div>

          {syncNotice ? (
            <div className="info-banner">
              <strong>{isCloudMode ? "云端模式" : "游客模式"}</strong>
              <span>{syncNotice}</span>
            </div>
          ) : null}

          <RoleSettings
            roleId={activeSession?.roleId || preferences.roleId}
            userNickname={activeSession?.userNickname || ""}
            girlfriendStyleId={activeSession?.girlfriendStyleId || GIRLFRIEND_STYLES[0].id}
            customPersona={activeSession?.customPersona || ""}
            disabled={isStreaming || memoryLoading}
            onRoleChange={handleRoleChange}
            onNicknameChange={handleNicknameChange}
            onStyleChange={handleStyleChange}
            onPersonaChange={handlePersonaChange}
          />

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

          {error ? (
            <div className="error-banner">
              <strong>{error}</strong>
              <span>控制台会输出详细错误，页面只保留简洁提示。</span>
            </div>
          ) : null}

          <div className="chat-thread">
            {activeSession?.messages.length ? (
              activeSession.messages.map((message) => (
                <article key={message.id} className={`bubble ${message.role}`}>
                  <div className="bubble-meta">
                    <span>{message.role === "user" ? "你" : getSessionRoleSummary(activeSession)}</span>
                    {message.role === "assistant" && message.content ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleCopy(message.content, message.id)}
                      >
                        {copiedMessageId === message.id ? "已复制" : "复制"}
                      </button>
                    ) : null}
                  </div>

                  {message.attachments?.length ? (
                    <div className="bubble-image-stack">
                      {message.attachments.map((attachment) => (
                        <img
                          key={attachment.id}
                          src={attachment.dataUrl}
                          alt={attachment.name || "用户上传图片"}
                          className="bubble-image"
                        />
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" && !message.content ? (
                    <div className="typing-shell">
                      <LoadingDots />
                      <small>正在输入...</small>
                    </div>
                  ) : message.content ? (
                    <p>{message.content}</p>
                  ) : null}
                </article>
              ))
            ) : (
              <section className="empty-state">
                <div className="empty-state-copy">
                  <p className="eyebrow">开始聊天</p>
                  <h3>
                    {activeRole.id === "girlfriend"
                      ? "现在可以切换性格、填昵称、导入记忆，再进入更懂你的 AI女友模式。"
                      : "选择一个角色，然后输入你的第一句话。"}
                  </h3>
                  <p>
                    {user
                      ? "当前已登录，聊天记录与记忆会保存到 Supabase，可在其他设备同步查看。"
                      : "当前为游客模式，会话和记忆保存在浏览器 localStorage。登录后可自动同步到云端。"}
                  </p>
                </div>

                <div className="starter-grid">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="starter-card"
                      onClick={() => setComposer(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div ref={bottomAnchorRef} />
          </div>

          <div className="thread-footer">
            <span>
              {user
                ? "当前为登录模式：新建、删除、切换会话与记忆修改都会同步到云端。"
                : "当前为游客模式：聊天记录和记忆仅保存在当前浏览器。"}
            </span>
            <span>已记住的要点：{memoryItems.length ? `${memoryItems.length} 条` : "暂无"}</span>
            <span>
              上次用户消息：
              {getLastUserMessage(activeSession?.messages || [])?.content || "暂无"}
            </span>
          </div>

          <MessageInput
            value={composer}
            disabled={isStreaming || memoryLoading}
            canRetry={Boolean(lastFailedRequest && lastFailedRequest.sessionId === activeSessionId)}
            imagePreview={selectedImage}
            onChange={setComposer}
            onPickImage={handlePickImage}
            onRemoveImage={handleRemoveImage}
            onSubmit={() => streamReply()}
            onRetry={handleRetry}
          />
        </section>
      </main>

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
