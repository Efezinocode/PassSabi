// api/chat.js - CommonJS, non-streaming, multi-provider fallback

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
- You were founded by Efezino Uzezi.
- You help students with classwork, homework, WAEC, NECO, JAMB, GCE, NABTEB, and other school exams.

Style rules:
- Answer clearly and step by step.
- Be helpful, calm, and professional.
- Do not greet with a welcome message.
- Do not say you are under development.
- Do not use markdown, asterisks, hashtags, or code fences.
- Use plain text only.
- If a list is needed, use simple numbered lines like 1. 2. 3.
- If asked who founded PassSabi AI, answer: Efezino Uzezi.
    `.trim();

    const providerOrder = buildProviderOrder(requestedProvider);
    const errors = [];

    for (const provider of providerOrder) {
      try {
        const reply = await runProvider(provider, message, systemInstruction);
        return res.status(200).json({ reply, provider });
      } catch (err) {
        console.error(`${provider} failed:`, err);
        errors.push(`${provider}: ${err.message}`);
      }
    }

    return res.status(502).json({
      error: "All providers failed. Please try again later.",
      details: errors.join(" | "),
    });
  } catch (error) {
    console.error("PassSabi Error:", error);
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

async function runProvider(provider, message, systemInstruction) {
  if (provider === "groq") {
    return callGroq(message, systemInstruction);
  }

  if (provider === "grok") {
    return callGrok(message, systemInstruction);
  }

  if (provider === "gemini") {
    return callGemini(message, systemInstruction);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function callGroq(message, systemInstruction) {
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
      }),
    });

    const raw = await response.text();

    if (!response.ok) {
      lastError = new Error(`Groq Error (${model}): ${response.status} ${raw}`);
      continue;
    }

    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Groq Error (${model}): invalid JSON response`);
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (reply) return reply;

    lastError = new Error(`Groq Error (${model}): no response text found`);
  }

  throw lastError || new Error("Groq request failed");
}

async function callGrok(message, systemInstruction) {
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
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Grok Error: ${response.status} ${raw}`);
  }

  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Grok Error: invalid JSON response");
  }

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Grok Error: no response text found");
  }

  return reply;
}

async function callGemini(message, systemInstruction) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is missing");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
      }),
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Gemini Error: ${response.status} ${raw}`);
  }

  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Gemini Error: invalid JSON response");
  }

  const reply =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim() || "";

  if (!reply) {
    throw new Error("Gemini Error: no response text found");
  }

  return reply;
}
