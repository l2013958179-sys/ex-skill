import { buildMemoryItemsFromAnalysis, buildMemorySummaryText } from "@/lib/memory/profile";
import {
  extractJsonObject,
  extractMessageText,
  requestAiChatCompletion,
  safeJsonParse,
} from "@/lib/server/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORTED_EXTENSIONS = ["txt", "json", "csv"];
const MAX_FILE_SIZE = 1024 * 1024 * 2;
const MAX_TRANSCRIPT_LENGTH = 18000;

function getFileExtension(fileName) {
  return String(fileName || "")
    .toLowerCase()
    .split(".")
    .pop();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(text) {
  if (text.length <= MAX_TRANSCRIPT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_TRANSCRIPT_LENGTH)}\n\n[已截断剩余内容，优先总结高频习惯与稳定偏好]`;
}

function flattenJsonValue(value, lines, depth = 0) {
  if (depth > 4 || value == null) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = normalizeText(String(value));
    if (text) {
      lines.push(text);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.slice(0, 400).forEach((item) => flattenJsonValue(item, lines, depth + 1));
    return;
  }

  if (typeof value === "object") {
    const speaker = normalizeText(
      value.sender || value.speaker || value.role || value.nickname || value.name,
    );
    const content = normalizeText(
      value.content || value.text || value.message || value.msg || value.body,
    );
    const time = normalizeText(value.time || value.timestamp || value.created_at || value.date);

    if (speaker || content) {
      lines.push([time, speaker ? `${speaker}:` : "", content].filter(Boolean).join(" "));
      return;
    }

    Object.values(value)
      .slice(0, 24)
      .forEach((item) => flattenJsonValue(item, lines, depth + 1));
  }
}

function parseCsvText(rawText) {
  return rawText
    .split(/\r?\n/)
    .slice(0, 400)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function parseImportText(rawText, extension) {
  if (extension === "txt") {
    return rawText;
  }

  if (extension === "csv") {
    return parseCsvText(rawText);
  }

  if (extension === "json") {
    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      return rawText;
    }

    const lines = [];
    flattenJsonValue(parsed, lines);
    return lines.join("\n");
  }

  return rawText;
}

function collectFrequentTerms(text) {
  const stopwords = new Set([
    "今天",
    "然后",
    "就是",
    "我们",
    "你们",
    "这个",
    "那个",
    "一下",
    "真的",
    "还是",
    "已经",
    "可以",
    "因为",
    "不是",
    "一个",
    "感觉",
  ]);
  const matches = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  const counts = new Map();

  for (const word of matches) {
    if (stopwords.has(word)) {
      continue;
    }
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([word]) => word);
}

function buildFallbackAnalysis(text) {
  const frequentTerms = collectFrequentTerms(text);
  const positiveHits = (text.match(/开心|高兴|喜欢|想你|哈哈|期待|安心|抱抱/g) || []).length;
  const negativeHits = (text.match(/难过|烦|焦虑|累|崩溃|委屈|失眠|压力/g) || []).length;
  const habits = [
    /睡|熬夜/.test(text) ? "作息和睡眠是高频话题" : "",
    /吃|外卖|奶茶|咖啡/.test(text) ? "饮食偏好经常被提到" : "",
    /学习|上课|考试|复习/.test(text) ? "学习节奏和任务安排比较重要" : "",
    /上班|工作|加班|开会/.test(text) ? "工作压力与进度是常见内容" : "",
  ]
    .filter(Boolean)
    .join("；");

  return {
    summary:
      frequentTerms.length
        ? `这份记录里更常出现的话题有：${frequentTerms.join("、")}。建议把这些内容当作用户近期稳定关注点，自然融入陪伴式聊天。`
        : "记录内容较零散，建议只把它作为轻量背景记忆，在合适时自然引用。",
    preferred_names: /宝宝|宝贝|亲爱|乖乖|老婆|老公/.test(text)
      ? "聊天里出现过较亲密的称呼，适合在用户接受的前提下偶尔使用更亲近的叫法。"
      : "未明显识别出稳定昵称，建议以自然称呼为主，再根据后续对话慢慢确认。",
    speaking_style:
      frequentTerms.length
        ? `整体语气偏日常聊天，关键词集中在 ${frequentTerms.slice(0, 3).join("、")} 等话题上。`
        : "整体更像日常口语交流，适合短句、自然回应。",
    frequent_topics: frequentTerms.length ? frequentTerms.join("、") : "未提取到特别稳定的高频话题",
    emotion_tendency:
      negativeHits > positiveHits
        ? "记录里能看到压力、疲惫或情绪波动，适合多给安抚和陪伴感。"
        : "整体情绪偏平稳，夹杂一些轻松、亲近或期待感。",
    life_habits: habits || "生活习惯线索有限，建议通过后续聊天慢慢补充。",
    important_people_events: "建议只记住稳定的人物关系和长期事件，不要机械复述具体隐私细节。",
    likes_dislikes:
      frequentTerms.length
        ? `从高频表达看，用户可能更在意 ${frequentTerms.slice(0, 4).join("、")} 相关内容。`
        : "喜欢和不喜欢的内容暂时不够明确，需要结合后续对话继续观察。",
  };
}

async function summarizeTranscriptWithAi(transcript) {
  const response = await requestAiChatCompletion({
    stream: false,
    temperature: 0.3,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content: [
          "你是一个擅长提取用户长期记忆的中文分析助手。",
          "任务：从聊天记录中提炼稳定偏好和相处线索，供 AI 女友模式参考。",
          "要求：",
          "1. 只输出 JSON 对象，不要 markdown。",
          "2. 不要编造没有出现的信息。",
          "3. 总结要温和、抽象，不要泄露过细的隐私原句。",
          "4. 每个字段都输出中文字符串，没有信息就写“未明显提取”。",
          "JSON 字段：summary, preferred_names, speaking_style, frequent_topics, emotion_tendency, life_habits, important_people_events, likes_dislikes",
        ].join("\n"),
      },
      {
        role: "user",
        content: `请分析下面这份聊天记录：\n\n${truncateText(transcript)}`,
      },
    ],
  });

  if (!response.ok) {
    const rawText = await response.text();
    const parsed = safeJsonParse(rawText);
    const message = parsed?.error?.message || parsed?.message || "导入总结失败";
    throw new Error(message);
  }

  const payload = await response.json();
  const content = extractMessageText(payload);
  return extractJsonObject(content);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { error: "请上传聊天记录文件", code: "missing_file" },
        { status: 400 },
      );
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return Response.json(
        { error: "仅支持 txt / json / csv 文件", code: "invalid_file_type" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "文件过大，请先精简到 2MB 以内", code: "file_too_large" },
        { status: 400 },
      );
    }

    const rawText = await file.text();
    const transcript = parseImportText(rawText, extension).trim();

    if (!transcript) {
      return Response.json(
        { error: "聊天记录内容为空", code: "empty_file" },
        { status: 400 },
      );
    }

    let analysis = null;

    try {
      analysis = await summarizeTranscriptWithAi(transcript);
    } catch (error) {
      console.warn("AI 总结聊天记录失败，改用本地兜底规则:", error?.message || error);
    }

    const resolvedAnalysis = analysis || buildFallbackAnalysis(transcript);
    const memoryItems = buildMemoryItemsFromAnalysis(resolvedAnalysis, "wechat_import");

    return Response.json({
      ok: true,
      fileName: file.name,
      memoryItems,
      memorySummary: buildMemorySummaryText(memoryItems),
      transcriptPreview: truncateText(transcript).slice(0, 800),
    });
  } catch (error) {
    if (error?.code === "missing_api_key") {
      return Response.json(
        { error: "API Key 未配置", code: "missing_api_key" },
        { status: 500 },
      );
    }

    console.error("Serverless /api/import-chat-record 出错:", error);
    return Response.json(
      {
        error: "聊天记录导入失败，请稍后重试。",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
