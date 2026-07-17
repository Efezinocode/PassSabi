// js/api.js

export function extractSseData(block) {
  if (!block) return "";

  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
}

export async function streamChatReply({
  message,
  provider = "openai",
  signal,
  onChunk = () => {},
  onDone = () => {},
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      provider,
    }),
  });

  // Handle API errors
  if (!response.ok) {
    let errorMessage = "Something went wrong.";

    try {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } catch {
      errorMessage = await response.text();
    }

    throw new Error(errorMessage);
  }

  // -------------------------------
  // SSE STREAM
  // -------------------------------

  const contentType = response.headers.get("content-type") || "";

  if (
    contentType.includes("text/event-stream") &&
    response.body
  ) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, {
        stream: true,
      });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const data = extractSseData(event);

        if (!data) continue;

        if (data === "[DONE]") {
          onDone({
            provider,
            text: fullText,
          });

          return fullText;
        }

        try {
          const json = JSON.parse(data);

          if (json.delta) {
            fullText += json.delta;

            onChunk({
              delta: json.delta,
              fullText,
            });
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }

    onDone({
      provider,
      text: fullText,
    });

    return fullText;
  }

  // -------------------------------
  // NORMAL JSON
  // -------------------------------

  const json = await response.json();

  const text =
    json.text ||
    json.reply ||
    json.message ||
    "";

  onChunk({
    delta: text,
    fullText: text,
  });

  onDone({
    provider,
    text,
  });

  return text;
}