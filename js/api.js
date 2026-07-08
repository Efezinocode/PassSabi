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
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      errorText = "";
    }
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Missing streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }

    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary === -1) break;

      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data = extractSseData(block);
      if (!data || data === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      if (parsed.chunk) {
        const incoming = String(parsed.chunk);
        fullText += incoming;

        if (typeof onChunk === "function") {
          onChunk(incoming, fullText, parsed);
        }
      }

      if (parsed.done && typeof onDone === "function") {
        onDone(parsed.provider);
      }
    }

    if (done) break;
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    const data = extractSseData(buffer);
    if (data && data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);

        if (parsed.error) {
          throw new Error(parsed.error);
        }

        if (parsed.chunk) {
          const incoming = String(parsed.chunk);
          fullText += incoming;

          if (typeof onChunk === "function") {
            onChunk(incoming, fullText, parsed);
          }
        }

        if (parsed.done && typeof onDone === "function") {
          onDone(parsed.provider);
        }
      } catch {
        // ignore trailing parse noise
      }
    }
  }

  return fullText.trim();
}