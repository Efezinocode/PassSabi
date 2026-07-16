// api/chat.js
const { generateReply, toBool } = require("./providers.js");

function json(res, status, data) {
  return res.status(status).json(data);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeMessageItem(item) {
  if (!item || typeof item !== "object") return null;

  const role =
    item.role === "assistant" ||
    item.role === "system" ||
    item.role === "developer"
      ? item.role
      : "user";

  const content = String(item.content ?? item.text ?? item.message ?? "").trim();
  if (!content) return null;

  return { role, content };
}

function normalizeMessages(body) {
  if (Array.isArray(body.messages)) {
    const messages = body.messages
      .map(normalizeMessageItem)
      .filter(Boolean);

    if (messages.length) return messages;
  }

  const fallbackText = String(
    body.message ?? body.prompt ?? body.text ?? ""
  ).trim();

  if (fallbackText) {
    return [{ role: "user", content: fallbackText }];
  }

  return [];
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      service: "PassSabi AI API",
      status: "healthy",
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const body = parseBody(req);
    const messages = normalizeMessages(body);

    const systemPrompt =
      typeof body.systemPrompt === "string" ? body.systemPrompt : "";

    const provider =
      typeof body.provider === "string" && body.provider.trim()
        ? body.provider.trim().toLowerCase()
        : "openai";

    const temperature =
      typeof body.temperature === "number" ? body.temperature : 0.7;

    const maxTokens =
      typeof body.maxTokens === "number" ? body.maxTokens : 900;

    const webSearch = toBool(
      body.webSearch,
      toBool(process.env.OPENAI_WEB_SEARCH, false)
    );

    if (!messages.length) {
      return json(res, 400, {
        ok: false,
        error: "messages is required",
      });
    }

    const result = await generateReply({
      messages,
      systemPrompt,
      provider,
      temperature,
      maxTokens,
      webSearch,
    });

    return json(res, 200, {
      ok: true,
      provider: result.provider,
      model: result.model,
      reply: result.text,
      attempts: result.attempts || [],
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error?.message || "Server error",
      attempts: error?.attempts || [],
    });
  }
};
