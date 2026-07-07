// api/chat.js - CommonJS, streaming SSE, multi-provider fallback

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedProvider =
      typeof body.provider === "string"
        ? body.provider.trim().toLowerCase()
        : "";

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemInstruction = `
You are PassSabi AI, a friendly AI teacher for students.

Facts about you:
- Your name is PassSabi AI.
- You were founded by Uzezi Great Efezino.
- You help students with classwork, homework, WAEC, NECO, JAMB, GCE, NABTEB, and other school exams.

Style rules:
- Answer clearly and step by step.
- Be helpful, calm, and professional.
- Do not greet with a welcome message.
- Do not say you are under development.
- Do not use markdown, asterisks, hashtags, or code fences.
- Use plain text only.
- If a list is needed, use simple numbered lines like 1. 2. 3.
- If asked who founded PassSabi AI, answer: Uzezi Great Efezino.
    `.trim();

    const providerOrder = buildProviderOrder(requestedProvider);
    const errors = [];

    let streamStarted = false;

    const startStream = () => {
      if (streamStarted) return;

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      streamStarted = true;
    };

    const sendEvent = (payload) => {
      startStream();
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    for (const provider of providerOrder) {
      const providerState = { emittedAnyChunk: false };

      try {
        sendEvent({ status: "thinking", provider });

        const reply = await runProvider(provider, message, systemInstruction, (chunk) => {
          providerState.emittedAnyChunk = true;
          sendEvent({ chunk, provider });
        });

        sendEvent({ done: true, provider });
        return res.end();
      } catch (err) {
        console.error(`${provider} failed:`, err);

        if (providerState.emittedAnyChunk) {
          sendEvent({
            error: `Stream interrupted from ${provider}. ${err.message}`,
            provider,
          });
          return res.end();
        }

        errors.push(`${provider}: ${err.message}`);
        sendEvent({
          status: "error",
          provider,
          message: err.message,
        });
      }
    }

    sendEvent({
      error: "All providers failed. Please try again later.",
      details: errors.join(" | "),
    });
    return res.end();
  } catch (error) {
    console.error("PassSabi Error:", error);

    if (res.headersSent) {
      try {
        res.write(
          `data: ${JSON.stringify({
            error: error.message || "Server error. Please try again.",
          })}\n\n`
        );
      } catch (e) {
        console.error("Failed to write stream error:", e);
      }
      return res.end();
    }

    return res.status(500).json({
      error: error.message || "Server error. Please try again.",
    });
  }
};

function buildProviderOrder(requestedProvider) {
  const baseOrder = ["groq", "grok", "gemini"];

  if (!requestedProvider || !baseOrder.includes(requestedProvider)) {
    return baseOrder;
  }

  return [requestedProvider, ...baseOrder.filter((p) => p !== requestedProvider)];
}

async function runProvider(provider, message, systemInstruction, onChunk) {
  if (provider === "groq") {
    return callGroq(message, systemInstruction, onChunk);
  }

  if (provider === "grok") {
    return callGrok(message, systemInstruction, onChunk);
  }

  if (provider === "gemini") {
    return callGemini(message, systemInstruction, onChunk);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function callGroq(message, systemInstruction, onChunk) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key is missing");

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let lastError = null;

  for (const model of models) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      lastError = new Error(`Groq Error (${model}): ${response.status} ${raw}`);
      continue;
    }

    try {
      const full = await consumeSseStream(
        response,
        (json) => json.choices?.[0]?.delta?.content || "",
        onChunk
      );

      if (full) return full;

      lastError = new Error(`Groq Error (${model}): no response text found`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Groq request failed");
}

async function callGrok(message, systemInstruction, onChunk) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("Grok API key is missing");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.3",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Grok Error: ${response.status} ${raw}`);
  }

  const full = await consumeSseStream(
    response,
    (json) => json.choices?.[0]?.delta?.content || "",
    onChunk
  );

  if (!full) throw new Error("Grok Error: no response text found");
  return full;
}

async function callGemini(message, systemInstruction, onChunk) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is missing");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
      }),
    }
  );

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Gemini Error: ${response.status} ${raw}`);
  }

  const full = await consumeSseStream(
    response,
    (json) =>
      json.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || "")
        .join("") || "",
    onChunk
  );

  if (!full) throw new Error("Gemini Error: no response text found");
  return full;
}

async function consumeSseStream(response, extractText, onChunk) {
  if (!response.body) {
    throw new Error("Missing streaming response body");
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
      if (!data) continue;

      if (data === "[DONE]") {
        return fullText.trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const incoming = extractText(parsed) || "";
      const delta = computeDelta(fullText, incoming);

      if (delta) {
        fullText += delta;
        onChunk(delta);
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
        const incoming = extractText(parsed) || "";
        const delta = computeDelta(fullText, incoming);
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      } catch {
        // ignore leftover parse noise
      }
    }
  }

  return fullText.trim();
}

function extractSseData(block) {
  const lines = block.split(/\r?\n/);
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^\s+/, ""));
    }
  }

  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

function computeDelta(currentFullText, incomingText) {
  if (!incomingText) return "";
  if (!currentFullText) return incomingText;
  if (incomingText === currentFullText) return "";
  if (incomingText.startsWith(currentFullText)) {
    return incomingText.slice(currentFullText.length);
  }
  return incomingText;
}