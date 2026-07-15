// api/chat.js
// Streams replies in the exact SSE format the frontend expects:
// data: ...\n\n
// data: [DONE]\n\n

const { buildProviderOrder, runProvider } = require("./providers.js");

const SYSTEM_INSTRUCTION = `
You are PassSabi AI, a friendly AI teacher for students in Nigeria.

Teach clearly, step by step, using simple words.
Be helpful, accurate, and calm.
Use examples when helpful.
If the student asks for exam help, answer in an exam-friendly way.
Do not mention policies unless the student asks.
`.trim();

function parseBody(req) {
  const body = req.body;

  if (!body) return {};
  if (typeof body === "object") return body;

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return {};
}

function sendSseHeaders(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function writeSseData(res, data) {
  const text = String(data ?? "");

  if (!text) {
    res.write("data:\n\n");
    return;
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

function writeSseDone(res) {
  res.write("data: [DONE]\n\n");
}

function writeSseError(res, message) {
  writeSseData(res, message || "Something went wrong.");
  writeSseDone(res);
}

function normalizeMessage(message) {
  if (Array.isArray(message)) {
    return message.join("\n\n").trim();
  }
  return String(message ?? "").trim();
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    String(error?.message || "").toLowerCase().includes("aborted")
  );
}

function getDeltaText(fullText, previousText) {
  const current = String(fullText || "");
  const previous = String(previousText || "");

  if (!previous) return current;
  if (current.startsWith(previous)) return current.slice(previous.length);

  return current;
}

async function streamWithProviders({ message, provider, onChunk }) {
  const providerOrder = buildProviderOrder(provider);
  let lastError = null;

  for (const name of providerOrder) {
    try {
      let fullText = "";
      let emittedText = "";

      const maybeResult = await runProvider(
        name,
        message,
        SYSTEM_INSTRUCTION,
        (chunk) => {
          if (chunk == null) return;

          const chunkText = String(chunk);

          // Some providers send cumulative text, some send only the latest delta.
          if (chunkText.length >= fullText.length && chunkText.startsWith(fullText)) {
            fullText = chunkText;
          } else {
            fullText += chunkText;
          }

          const delta = getDeltaText(fullText, emittedText);
          if (delta) {
            emittedText = fullText;
            onChunk(delta);
          }
        }
      );

      if (typeof maybeResult === "string" && maybeResult.trim()) {
        fullText = maybeResult;
        const delta = getDeltaText(fullText, emittedText);
        if (delta) {
          emittedText = fullText;
          onChunk(delta);
        }
      }

      return { provider: name, text: fullText };
    } catch (error) {
      lastError = error;
      if (isAbortError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No provider available.");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendSseHeaders(res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const body = parseBody(req);
  const message = normalizeMessage(body.message);
  const provider = body.provider ? String(body.provider).trim() : "";

  if (!message) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Message is required." }));
  }

  sendSseHeaders(res);

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  let clientClosed = false;

  req.on("close", () => {
    clientClosed = true;
  });

  try {
    const result = await streamWithProviders({
      message,
      provider,
      onChunk: (deltaText) => {
        if (clientClosed) return;
        writeSseData(res, deltaText);
      },
    });

    if (!clientClosed) {
      writeSseDone(res);
    }

    return res.end();
  } catch (error) {
    if (clientClosed) return;

    const safeMessage = isAbortError(error)
      ? "Request was cancelled."
      : error?.message || "Something went wrong.";

    writeSseError(res, safeMessage);
    return res.end();
  }
};