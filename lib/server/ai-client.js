const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";

export function normalizeBaseUrl(baseUrl) {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractDeltaText(payload) {
  const choice = payload?.choices?.[0];
  const delta = choice?.delta?.content ?? choice?.message?.content ?? "";

  if (typeof delta === "string") {
    return delta;
  }

  if (Array.isArray(delta)) {
    return delta
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? "";

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function createTextStream(upstreamBody) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader();
      let buffer = "";

      const pushEventBlock = (eventBlock) => {
        const lines = eventBlock.split(/\r?\n/);

        for (const line of lines) {
          if (!line.startsWith("data:")) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data) {
            continue;
          }

          if (data === "[DONE]") {
            return true;
          }

          const parsed = safeJsonParse(data);
          if (!parsed) {
            console.error("无法解析上游流式数据:", data);
            continue;
          }

          const text = extractDeltaText(parsed);
          if (text) {
            controller.enqueue(encoder.encode(text));
          }

          if (parsed?.choices?.[0]?.finish_reason) {
            return true;
          }
        }

        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const matched = buffer.match(/\r?\n\r?\n/);
            if (!matched || matched.index === undefined) {
              break;
            }

            const boundary = matched.index;
            const eventBlock = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + matched[0].length);

            if (pushEventBlock(eventBlock)) {
              controller.close();
              return;
            }
          }
        }

        if (buffer.trim()) {
          pushEventBlock(buffer);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function getTextModel() {
  return process.env.AI_MODEL || "deepseek-chat";
}

export function getVisionModel() {
  return process.env.AI_VISION_MODEL || "";
}

export async function requestAiChatCompletion({
  messages,
  stream = false,
  temperature = 0.7,
  model,
  maxTokens,
}) {
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    const error = new Error("API Key 未配置");
    error.code = "missing_api_key";
    throw error;
  }

  const response = await fetch(`${normalizeBaseUrl(process.env.AI_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || getTextModel(),
      stream,
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  });

  return response;
}

export function extractJsonObject(text) {
  if (typeof text !== "string") {
    return null;
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const parsed = safeJsonParse(fencedMatch[1].trim());
    if (parsed) {
      return parsed;
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return safeJsonParse(text.slice(start, end + 1));
}
