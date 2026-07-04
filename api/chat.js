// api/chat.js - Non-Streaming Version (Simpler & More Stable)

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { message, provider = "groq" } = body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
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

    let reply = "";
    let usedProvider = "";

    if (provider === "groq" || provider === "default") {
      reply = await callGroq(trimmedMessage, systemInstruction);
      usedProvider = "groq";
    } else if (provider === "grok") {
      reply = await callGrok(trimmedMessage, systemInstruction);
      usedProvider = "grok";
    } else {
      reply = await callGemini(trimmedMessage, systemInstruction);
      usedProvider = "gemini";
    }

    return res.status(200).json({ reply, provider: usedProvider });

  } catch (error) {
    console.error("PassSabi Error:", error);
    return res.status(500).json({ error: error.message || "Server error. Please try again." });
  }
};

// ==================== SIMPLE API CALLS ====================

async function callGroq(message, systemInstruction) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key is missing");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq Error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response";
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
      model: "grok-4",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
    }),
  });

  if (!response.ok) throw new Error(`Grok Error: ${response.status}`);

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response";
}

async function callGemini(message, systemInstruction) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is missing");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No response";
}
