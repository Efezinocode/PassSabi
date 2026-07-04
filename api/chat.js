// api/chat.js

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { message, provider: requestedProvider = "groq" } = body;

    if (!message || !message.trim()) {
      sendEvent({ error: "Message is required" });
      return res.end();
    }

    const trimmedMessage = message.trim();

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

    let usedProvider = "";
    const providers = requestedProvider ? [requestedProvider] : ["groq", "grok", "gemini"];
    let finalReply = "";

    for (const prov of providers) {
      try {
        sendEvent({ status: "thinking", provider: prov });

        if (prov === "grok") {
          finalReply = await streamGrok(trimmedMessage, systemInstruction, sendEvent);
        } else if (prov === "groq") {
          finalReply = await streamGroq(trimmedMessage, systemInstruction, sendEvent);
        } else if (prov === "gemini") {
          finalReply = await streamGemini(trimmedMessage, systemInstruction, sendEvent);
        }

        if (finalReply) {
          usedProvider = prov;
          break;
        }
      } catch (err) {
        console.warn(`Provider ${prov} failed:`, err.message);
        sendEvent({ status: "error", provider: prov, message: err.message });
      }
    }

    if (finalReply) {
      console.log(`✅ Answered by ${usedProvider}`);
      sendEvent({ done: true, provider: usedProvider });
    } else {
      sendEvent({ error: "All providers failed. Please try again." });
    }

  } catch (error) {
    console.error("PassSabi Error:", error);
    sendEvent({ error: "Server error. Please try again later." });
  } finally {
    res.end();
  }
};

// ==================== STREAMING FUNCTIONS ====================

async function streamGroq(message, systemInstruction, sendEvent) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key is missing");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",   // ← Fixed (no longer deprecated)
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`Groq Error: ${response.status}`);

  let fullText = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            fullText += text;
            sendEvent({ chunk: text });
          }
        } catch (e) {}
      }
    }
  }
  return fullText.trim();
}

// Keep your other two functions (streamGrok and streamGemini) as they are
async function streamGrok(message, systemInstruction, sendEvent) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("Grok API key is missing");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`Grok Error: ${response.status}`);

  let fullText = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            fullText += text;
            sendEvent({ chunk: text });
          }
        } catch (e) {}
      }
    }
  }
  return fullText.trim();
}

async function streamGemini(message, systemInstruction, sendEvent) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is missing");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);

  let fullText = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) {
            fullText += text;
            sendEvent({ chunk: text });
          }
        } catch (e) {}
      }
    }
  }
  return fullText.trim();
        }
