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
    const messages = body.messages.map(normalizeMessageItem).filter(Boolean);
    if (messages.length) return messages;
  }

  const fallbackText = String(body.message ?? body.prompt ?? body.text ?? "").trim();

  if (fallbackText) {
    return [{ role: "user", content: fallbackText }];
  }

  return [];
}

function setSseHeaders(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

function writeSse(res, payload) {
  const data =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  res.write(`data: ${data}\n\n`);
}

function splitTextIntoChunks(text, size = 120) {
  const value = String(text || "");
  if (!value) return [];

  const chunks = [];
  let index = 0;

  while (index < value.length) {
    let end = Math.min(index + size, value.length);

    if (end < value.length) {
      const lastSpace = value.lastIndexOf(" ", end);
      if (lastSpace > index + 30) {
        end = lastSpace + 1;
      }
    }

    const chunk = value.slice(index, end);
    if (chunk) chunks.push(chunk);
    index = end;
  }

  return chunks;
}

async function streamReply(res, text) {
  const chunks = splitTextIntoChunks(text, 120);

  if (!chunks.length) {
    writeSse(res, { delta: "" });
    writeSse(res, "[DONE]");
    return;
  }

  for (const chunk of chunks) {
    writeSse(res, { delta: chunk });
  }

  writeSse(res, "[DONE]");
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
        : "xai";

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
        error: "Please send a message and try again.",
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

    setSseHeaders(res);
    await streamReply(res, result.text);

    return res.end();
  } catch (error) {
    console.error("PassSabi AI API error:", error);
    return json(res, 503, {
      ok: false,
      error: "PassSabi AI is busy right now. Please try again in a minute.",
      attempts: error?.attempts || [],
    });
  }
};