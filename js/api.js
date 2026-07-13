// js/api.js

function extractSseData(block) {
  const lines = String(block || "").split(/\r?\n/);
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^\s+/, ""));
    }
  }

  return dataLines.length ? dataLines.join("\n") : null;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readResponseAsText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function streamChatReply({
  message,
  signal,
  onChunk,
  onDone,
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok) {
    const errorText = await readResponseAsText(response);
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Missing streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let doneCalled = false;

  const emitParsedBlock = (block) => {
    const data = extractSseData(block);
    if (!data || data === "[DONE]") return;

    const parsed = tryParseJson(data);
    if (!parsed) return;

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    if (typeof parsed.chunk === "string" && parsed.chunk.length > 0) {
      const incoming = parsed.chunk;
      fullText += incoming;

      if (typeof onChunk === "function") {
        onChunk(incoming, fullText, parsed);
      }
    }

    if (parsed.done && !doneCalled) {
      doneCalled = true;
      if (typeof onDone === "function") {
        onDone(parsed.provider);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        try {
          emitParsedBlock(block);
        } catch (err) {
          try {
            await reader.cancel();
          } catch {
            // ignore cancel errors
          }
          throw err;
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }

      if (done) break;
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      try {
        emitParsedBlock(buffer);
      } catch (err) {
        try {
          await reader.cancel();
        } catch {
          // ignore cancel errors
        }
        throw err;
      }
    }

    if (!doneCalled && typeof onDone === "function") {
      onDone(undefined);
    }

    return fullText.trim();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw err;
    }

    throw err instanceof Error ? err : new Error(String(err || "Chat stream failed."));
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
  }
}