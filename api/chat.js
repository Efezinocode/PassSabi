// api/chat.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable",
      });
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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "gemini-3.5-flash",
          input: message,
          system_instruction: systemInstruction,
        }),
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        error: `Gemini API error: ${response.status}`,
        details: raw,
      });
    }

    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from Gemini",
        details: raw,
      });
    }

    const reply = extractReply(data);

    if (!reply) {
      return res.status(502).json({
        error: "No response text found",
        details: raw,
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
}

function extractReply(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (typeof data?.response?.output_text === "string" && data.response.output_text.trim()) {
    return data.response.output_text.trim();
  }

  if (Array.isArray(data?.steps)) {
    const text = data.steps
      .map((step) => {
        if (!Array.isArray(step?.content)) return "";
        return step.content.map((part) => part?.text || "").join("");
      })
      .join("")
      .trim();

    if (text) return text;
  }

  if (Array.isArray(data?.candidates)) {
    const text = data.candidates
      .map((candidate) => {
        const parts = candidate?.content?.parts;
        if (!Array.isArray(parts)) return "";
        return parts.map((part) => part?.text || "").join("");
      })
      .join("")
      .trim();

    if (text) return text;
  }

  return "";
}
