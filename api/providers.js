// api/providers.js

function buildProviderOrder(requestedProvider) {
  const baseOrder = ["groq", "grok", "gemini"];

  if (!requestedProvider || !baseOrder.includes(requestedProvider)) {
    return baseOrder;
  }

  return [requestedProvider, ...baseOrder.filter((p) => p !== requestedProvider)];
}

async function runProvider(provider, message, systemInstruction, onChunk) {
  if (provider === "groq") return callGroq(message, systemInstruction, onChunk);
  if (provider === "grok") return callGrok(message, systemInstruction, onChunk);
  if (provider === "gemini") return callGemini(message, systemInstruction, onChunk);
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

    const full = await consumeSseStream(
      response,
      (json) => json.choices?.[0]?.delta?.content || "",
      onChunk
    );

    if (full) return full;
    lastError = new Error(`Groq Error (${model}): no response text found`);
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
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
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
    let result;
    try {
      result = await reader.read();
    } catch (err) {
      if (fullText.trim()) return fullText.trim();
      throw err;
    }

    const { done, value } = result;

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

      try {
        const parsed = JSON.parse(data);
        const text = extractText(parsed) || "";
        if (text) {
          const delta = computeDelta(fullText, text);
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        }
      } catch {
        // ignore parse noise
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
        const text = extractText(parsed) || "";
        if (text) {
          const delta = computeDelta(fullText, text);
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
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

module.exports = {
  buildProviderOrder,
  runProvider,
};