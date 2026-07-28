// api/chat.js
const { generateReply, toBool } = require("./providers.js");

// ---------------------------------------------------------------------
// Basic abuse controls
// ---------------------------------------------------------------------
// This endpoint is intentionally reachable without login, because the
// app has a "Start Free Chat" guest mode — so we can't just require a
// session. Instead we layer a few cheap checks: an Origin allowlist on
// POST requests (blocks random curl/script abuse of the kind the README
// itself showed as a copy-pasteable example), a best-effort rate limit
// per IP, and hard clamps on every knob a client can influence.
//
// NOTE: the rate limiter below is in-memory and lives only for the life
// of one warm serverless instance — it resets on cold start and is NOT
// shared across concurrent instances. That's a reasonable first line of
// defense against casual abuse, but for real production-grade
// protection, back this with a durable store (Vercel KV, Upstash Redis,
// or a Supabase table keyed by IP/user) instead.
// ---------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitBuckets = new Map();

const PROVIDER_ALLOWLIST = ["xai", "groq", "gemini", "openai"];
const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 12000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

// Keeps the bucket map from growing forever on a long-lived warm instance.
function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS * 5) {
      rateLimitBuckets.delete(ip);
    }
  }
}

function getAllowedOrigins() {
  const configured = getEnv("ALLOWED_ORIGINS", "");
  const fromEnv = configured
    ? configured.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

  const vercelUrl = getEnv("VERCEL_URL", "");
  const currentDeployment = vercelUrl ? `https://${vercelUrl}` : "";

  return [
    ...fromEnv,
    currentDeployment,
    "https://passsabi.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
  ].filter(Boolean);
}

// Strict on purpose: a real browser fetch() from our own frontend always
// sends a matching Origin header on POST, so this only blocks requests
// that didn't come from the app itself (curl, other sites, etc).
function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || req.headers.referrer || "";
  const allowed = getAllowedOrigins();

  return allowed.some(
    (allowedOrigin) =>
      (origin && origin === allowedOrigin) ||
      (referer && referer.startsWith(allowedOrigin))
  );
}

function getQueryParam(req, key) {
  if (req.query && typeof req.query[key] === "string") return req.query[key];
  try {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(key) || "";
  } catch {
    return "";
  }
}

function clamp(value, min, max, fallback) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, num));
}

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
  cleanupRateLimitBuckets();
  const ip = getClientIp(req);

  if (req.method === "GET") {
    const message = getQueryParam(req, "message");

    if (!message.trim()) {
      return json(res, 200, {
        ok: true,
        service: "PassSabi AI API",
        status: "healthy",
      });
    }

    // Debug shortcut described in the README: GET /api/chat?message=hello
    // Off by default in production — set ENABLE_DEBUG_GET=true (dev/local
    // only) to turn it on. This keeps it from being a free, unmetered,
    // no-Origin-check way to hit paid providers by just typing a URL.
    if (!toBool(getEnv("ENABLE_DEBUG_GET"), false)) {
      return json(res, 403, {
        ok: false,
        error:
          "The GET debug shortcut is disabled. Set ENABLE_DEBUG_GET=true " +
          "in your environment (development only) to use it.",
      });
    }

    if (isRateLimited(ip)) {
      return json(res, 429, { ok: false, error: "Too many requests. Please slow down." });
    }

    try {
      const result = await generateReply({
        messages: [{ role: "user", content: message.trim().slice(0, MAX_TOTAL_CHARS) }],
        provider: "xai",
        temperature: 0.7,
        maxTokens: 400,
      });

      return json(res, 200, { ok: true, provider: result.provider, text: result.text });
    } catch (error) {
      console.error("PassSabi AI debug GET error:", error);
      return json(res, 503, { ok: false, error: "PassSabi AI is busy right now." });
    }
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  if (!isAllowedOrigin(req)) {
    return json(res, 403, {
      ok: false,
      error: "Requests must come from the PassSabi AI app.",
    });
  }

  if (isRateLimited(ip)) {
    return json(res, 429, {
      ok: false,
      error: "Too many requests. Please wait a moment and try again.",
    });
  }

  try {
    const body = parseBody(req);
    const messages = normalizeMessages(body).slice(-MAX_MESSAGES);

    const systemPrompt =
      typeof body.systemPrompt === "string"
        ? body.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS)
        : "";

    const requestedProvider = String(body.provider || "").trim().toLowerCase();
    const provider = PROVIDER_ALLOWLIST.includes(requestedProvider)
      ? requestedProvider
      : "xai";

    const temperature = clamp(body.temperature, 0, 1.2, 0.7);
    const maxTokens = clamp(body.maxTokens, 64, 1200, 900);

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

    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return json(res, 400, {
        ok: false,
        error: "That conversation is too long for one request. Please start a new chat.",
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