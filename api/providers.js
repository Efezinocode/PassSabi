// api/providers.js
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_PROVIDER_ORDER = ["openai", "groq", "xai", "gemini"];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    if (["0", "false", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

function normalizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];

  return list
    .map((msg) => {
      const role =
        msg?.role === "assistant" ||
        msg?.role === "system" ||
        msg?.role === "developer" ||
        msg?.role === "user"
          ? msg.role
          : "user";

      const content =
        typeof msg?.content === "string"
          ? msg.content
          : typeof msg?.text === "string"
            ? msg.text
            : "";

      return { role, content: cleanText(content) };
    })
    .filter((msg) => msg.content);
}

function buildProviderOrder(preferredProvider = "openai") {
  const preferred = cleanText(preferredProvider || "openai").toLowerCase();

  const order = [
    "openai",
    ...DEFAULT_PROVIDER_ORDER.filter((provider) => provider !== "openai"),
  ];

  if (preferred && order.includes(preferred)) {
    return [preferred, ...order.filter((p) => p !== preferred)];
  }

  return order;
}

function extractResponseText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const parts = [];

  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const contentItem of item.content) {
        if (typeof contentItem?.text === "string") {
          parts.push(contentItem.text);
        }
      }
    }
  }

  return parts.join("").trim();
}

function extractTextFromOpenAIChatCompletion(data) {
  const choiceText = data?.choices?.[0]?.message?.content;

  if (typeof choiceText === "string" && choiceText.trim()) {
    return choiceText.trim();
  }

  if (Array.isArray(choiceText)) {
    const joined = choiceText
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  return "";
}

function extractTextFromGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function safeJsonResponse(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function createFetchError(provider, response, data) {
  const status = response ? `${response.status} ${response.statusText}` : "Unknown error";
  const apiMessage =
    data?.error?.message ||
    data?.message ||
    data?.error ||
    data?.detail ||
    data?.msg ||
    "Unknown provider error";

  const error = new Error(`${provider} failed: ${status} — ${apiMessage}`);
  error.status = response?.status || 0;
  error.provider = provider;
  return error;
}

function buildOpenAIInput(messages, systemPrompt) {
  const safeMessages = normalizeMessages(messages);
  const input = [];

  const instructions = cleanText(systemPrompt);
  if (instructions) {
    input.push({ role: "system", content: instructions });
  }

  for (const msg of safeMessages) {
    if (msg.role === "system") {
      input.push({ role: "system", content: msg.content });
      continue;
    }

    if (msg.role === "developer") {
      input.push({ role: "developer", content: msg.content });
      continue;
    }

    input.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  return input;
}

function getOpenAIModelCandidates() {
  const primary = getEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const fallbackEnv = getEnv("OPENAI_MODEL_FALLBACKS", "gpt-4o-mini");
  const raw = [primary, ...fallbackEnv.split(",")];

  const seen = new Set();
  const models = [];

  for (const item of raw) {
    const model = cleanText(item);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }

  return models.length ? models : ["gpt-4.1-mini", "gpt-4o-mini"];
}

function isLikelyModelError(error) {
  const text = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);

  if ([400, 404, 422].includes(status)) return true;

  return (
    text.includes("model") &&
    (
      text.includes("not found") ||
      text.includes("does not exist") ||
      text.includes("invalid") ||
      text.includes("unknown") ||
      text.includes("unsupported") ||
      text.includes("permission")
    )
  );
}

async function callOpenAI({
  messages,
  systemPrompt,
  maxTokens = 900,
  webSearch = false,
  model,
}) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const chosenModel = cleanText(model || getEnv("OPENAI_MODEL", "gpt-4.1-mini"));
  const input = buildOpenAIInput(messages, systemPrompt);
  const tools = webSearch ? [{ type: "web_search" }] : undefined;

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: chosenModel,
      input,
      tools,
      tool_choice: webSearch ? "auto" : "none",
      max_output_tokens: maxTokens,
    }),
  });

  const data = await safeJsonResponse(response);

  if (!response.ok) {
    throw createFetchError("OpenAI", response, data);
  }

  const text = extractResponseText(data);
  if (!text) throw new Error("OpenAI returned an empty response");

  return {
    provider: "openai",
    model: chosenModel,
    text,
    raw: data,
  };
}

async function callOpenAICompatible({
  providerName,
  endpoint,
  apiKey,
  model,
  messages,
  systemPrompt,
  temperature = 0.7,
  maxTokens = 900,
}) {
  if (!apiKey) throw new Error(`${providerName} API key is missing`);

  const safeMessages = normalizeMessages(messages);
  const payloadMessages = [];

  const instructions = cleanText(systemPrompt);
  if (instructions) {
    payloadMessages.push({ role: "system", content: instructions });
  }

  for (const msg of safeMessages) {
    if (msg.role === "system" || msg.role === "developer") {
      payloadMessages.push({ role: "system", content: msg.content });
    } else {
      payloadMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: payloadMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data = await safeJsonResponse(response);

  if (!response.ok) {
    throw createFetchError(providerName, response, data);
  }

  const text = extractTextFromOpenAIChatCompletion(data);
  if (!text) throw new Error(`${providerName} returned an empty response`);

  return {
    provider: providerName.toLowerCase(),
    model,
    text,
    raw: data,
  };
}

async function callGemini({
  messages,
  systemPrompt,
  temperature = 0.7,
  maxTokens = 900,
}) {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const model = getEnv("GEMINI_MODEL", "gemini-2.0-flash");
  const safeMessages = normalizeMessages(messages);
  const instructions = cleanText(systemPrompt);

  const contents = safeMessages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (instructions) {
    body.systemInstruction = {
      parts: [{ text: instructions }],
    };
  }

  const response = await fetch(
    `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await safeJsonResponse(response);

  if (!response.ok) {
    throw createFetchError("Gemini", response, data);
  }

  const text = extractTextFromGeminiResponse(data);
  if (!text) throw new Error("Gemini returned an empty response");

  return {
    provider: "gemini",
    model,
    text,
    raw: data,
  };
}

async function attemptOpenAIProvider({
  messages,
  systemPrompt,
  temperature,
  maxTokens,
  webSearch,
}) {
  const modelCandidates = getOpenAIModelCandidates();
  let lastError = null;
  const attempts = [];

  for (const model of modelCandidates) {
    try {
      return await callOpenAI({
        messages,
        systemPrompt,
        maxTokens,
        webSearch,
        model,
      });
    } catch (error) {
      lastError = error;
      attempts.push({
        provider: "openai",
        model,
        error: error?.message || String(error),
      });

      if (!isLikelyModelError(error)) {
        const wrapped = new Error(error?.message || "OpenAI request failed");
        wrapped.attempts = attempts;
        throw wrapped;
      }
    }
  }

  const finalError = new Error(lastError?.message || "OpenAI failed");
  finalError.attempts = attempts;
  throw finalError;
}

async function generateReply({
  messages,
  systemPrompt = "",
  provider = "openai",
  temperature = 0.7,
  maxTokens = 900,
  webSearch = false,
} = {}) {
  const order = buildProviderOrder(provider);
  const attempts = [];
  let lastError = null;

  for (const item of order) {
    try {
      let result;

      if (item === "openai") {
        result = await attemptOpenAIProvider({
          messages,
          systemPrompt,
          temperature,
          maxTokens,
          webSearch,
        });
      } else if (item === "groq") {
        result = await callOpenAICompatible({
          providerName: "Groq",
          endpoint: GROQ_ENDPOINT,
          apiKey: getEnv("GROQ_API_KEY"),
          model: getEnv("GROQ_MODEL", "llama-3.1-70b-versatile"),
          messages,
          systemPrompt,
          temperature,
          maxTokens,
        });
      } else if (item === "xai") {
        result = await callOpenAICompatible({
          providerName: "xAI",
          endpoint: XAI_ENDPOINT,
          apiKey: getEnv("XAI_API_KEY"),
          model: getEnv("XAI_MODEL", "grok-2-latest"),
          messages,
          systemPrompt,
          temperature,
          maxTokens,
        });
      } else if (item === "gemini") {
        result = await callGemini({
          messages,
          systemPrompt,
          temperature,
          maxTokens,
        });
      } else {
        throw new Error(`Unknown provider: ${item}`);
      }

      return {
        ok: true,
        provider: result.provider,
        model: result.model,
        text: result.text,
        attempts,
      };
    } catch (error) {
      lastError = error;

      if (Array.isArray(error?.attempts) && error.attempts.length) {
        attempts.push(...error.attempts);
      } else {
        attempts.push({
          provider: item,
          error: error?.message || String(error),
        });
      }
    }
  }

  throw Object.assign(new Error(lastError?.message || "All providers failed"), {
    attempts,
  });
}

module.exports = {
  buildProviderOrder,
  generateReply,
  callOpenAI,
  callGemini,
  toBool,
};