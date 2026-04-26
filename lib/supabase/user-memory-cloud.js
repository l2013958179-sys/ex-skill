import { normalizeMemoryItems } from "@/lib/memory/profile";

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

function assertAuthenticatedUserId(userId) {
  if (!userId) {
    throw new Error("请先登录");
  }
}

export async function loadCloudMemoryItems(supabase, userId) {
  assertAuthenticatedUserId(userId);

  const { data, error } = await supabase
    .from("user_memories")
    .select("id, user_id, memory_type, content, source, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return normalizeMemoryItems(data || []);
}

export async function upsertCloudMemoryItems(supabase, userId, items) {
  assertAuthenticatedUserId(userId);

  const normalized = normalizeMemoryItems(items);
  if (!normalized.length) {
    return [];
  }

  const rows = normalized.map((item) => ({
    id: ensureUuid(item.id),
    user_id: userId,
    memory_type: item.memoryType,
    content: item.content,
    source: item.source || "manual",
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("user_memories").upsert(rows, {
    onConflict: "user_id,memory_type",
  });

  if (error) {
    throw error;
  }

  return rows;
}

export async function deleteCloudMemoryItem(supabase, userId, memoryType) {
  assertAuthenticatedUserId(userId);

  const { error } = await supabase
    .from("user_memories")
    .delete()
    .eq("user_id", userId)
    .eq("memory_type", memoryType);

  if (error) {
    throw error;
  }
}

export async function clearCloudMemoryItems(supabase, userId) {
  assertAuthenticatedUserId(userId);

  const { error } = await supabase.from("user_memories").delete().eq("user_id", userId);

  if (error) {
    throw error;
  }
}
