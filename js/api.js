// js/api.js

const DEFAULT_CHAT_ENDPOINT = "/api/chat";
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_RETRY_DELAY_MS = 1200;

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

export function extractSseData(block) {
  const text = normalizeText(block);
  if (!text) return "";

  const lines = text.split("\n");
  const dataLines = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;

    let value = line.slice(5);
    if (value.startsWith(" ")) value = value.slice(1);

    if (value === "[DONE]") continue;
    dataLines.push(value);
  }

  return dataLines.join("\n");
}

function decodeChunk(buffer, chunk) {
  return buffer + chunk;
}

function createTimeoutSignal(signal, timeoutMs) {
  if (typeof AbortController === "undefined") {
    return { signal, clear: () => {} };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else {
      signal.addEventListener(
        "abort",
        () => controller.abort(),
        { once: true }
      );
    }
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function readErrorText(response) {
  try {
    return (await response.text()) || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function makeStreamUrl(endpoint) {
  return endpoint || DEFAULT_CHAT_ENDPOINT;
}

export async function streamChatReply({
  message,
  provider,
  signal,
  onChunk,
  onDone,
  onError,
  endpoint = DEFAULT_CHAT_ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const payload = {
    message: String(message ?? ""),
  };

  if (provider) {
    payload.provider = provider;
  }

  const { signal: timeoutSignal, clear } = createTimeoutSignal(signal, timeoutMs);

  try {
    const response = await fetch(makeStreamUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal,
    });

    if (!response.ok) {
      const errorText = await readErrorText(response);
      throw new Error(errorText);
    }

    if (!response.body) {
      const fallbackText = await response.text();
      const parsed = safeJsonParse(fallbackText, null);
      const text =
        typeof parsed === "string"
          ? parsed
          : parsed?.reply || parsed?.text || fallbackText || "";
      if (text && onChunk) onChunk(String(text));
      if (onDone) onDone({ provider: provider || null, text: String(text || "") });
      return String(text || "");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = decodeChunk(buffer, decoder.decode(value, { stream: true }));
      const parts = buffer.split(/\n\n|\r\n\r\n|\r\r/g);
      buffer = parts.pop() || "";

      for (const part of parts) {
        const data = extractSseData(part);
        if (!data) continue;
        if (data === "[DONE]") continue;

        let chunkText = data;

        const parsed = safeJsonParse(data, null);
        if (parsed && typeof parsed === "object") {
          chunkText =
            parsed.delta ??
            parsed.text ??
            parsed.content ??
            parsed.message ??
            parsed.reply ??
            parsed.token ??
            "";
        }

        if (chunkText !== "") {
          fullText += String(chunkText);
          if (onChunk) onChunk(fullText);
        }
      }
    }

    if (buffer.trim()) {
      const tail = extractSseData(buffer);
      if (tail && tail !== "[DONE]") {
        const parsed = safeJsonParse(tail, null);
        const tailText =
          parsed && typeof parsed === "object"
            ? parsed.delta ??
              parsed.text ??
              parsed.content ??
              parsed.message ??
              parsed.reply ??
              parsed.token ??
              ""
            : tail;

        if (tailText !== "") {
          fullText += String(tailText);
          if (onChunk) onChunk(fullText);
        }
      }
    }

    if (onDone) onDone({ provider: provider || null, text: fullText });
    return fullText;
  } catch (error) {
    if (onError) onError(error);
    throw error;
  } finally {
    clear();
  }
}

export async function retryStreamChatReply(options = {}) {
  const {
    retries = 2,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    onError,
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await streamChatReply(options);
    } catch (error) {
      lastError = error;
      if (onError) onError(error, attempt);

      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * (attempt + 1))
        );
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed.");
}

export function stopStream(controller) {
  if (!controller) return;
  try {
    controller.abort();
  } catch {
    // ignore
  }
}