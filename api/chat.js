// api/chat.js
// Vercel-compatible API route for /api/chat
// Handles OPTIONS preflight, POST requests, and GET debug via ?message=
// Reads API key from process.env.GOOGLE_API_KEY or process.env.GEMINI_API_KEY

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Support GET for quick mobile debugging: /api/chat?message=hello
  let message = "";
  if (req.method === "GET") {
    try {
      const url = new URL(req.url, `https://${req.headers.host || 'example.com'}`);
      message = url.searchParams.get("message") || "";
      message = typeof message === "string" ? message.trim() : "";
    } catch (e) {
      message = "";
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required (use ?message= for GET)" });
    }
    // continue below to call Gemini using the message
  } else if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // If POST, parse body (Vercel usually provides req.body)
    if (req.method === "POST") {
      const body = req.body && Object.keys(req.body).length ? req.body : await readRawBody(req);
      message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const bearer = process.env.GOOGLE_BEARER_TOKEN || process.env.GEMINI_BEARER_TOKEN;

    if (!apiKey && !bearer) {
      // Helpful message for debugging — set the env var in Vercel project settings
      return res.status(500).json({ error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable" });
    }

    // Allow quick mock for testing without a real key
    if (process.env.MOCK_REPLY === "true") {
      return res.status(200).json({ reply: "This is a mock reply. Set GOOGLE_API_KEY to call Gemini." });
    }

    // Build headers for Gemini call
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["x-goog-api-key"] = apiKey;
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

    const systemInstruction = `You are PassSabi AI, a friendly AI teacher for students.

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
- If asked who founded PassSabi AI, answer: Efezino Uzezi.`.trim();

    // Call Gemini
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "gemini-3.5-flash", system_instruction: systemInstruction, input: message }),
    });

    const text = await resp.text();

    if (!resp.ok) {
      console.error("Gemini request failed:", text);
      return res.status(502).json({ error: "Gemini request failed", details: text });
    }

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = null;
    }

    const reply = extractReply(data) || (data && data.reply) || (typeof text === "string" ? text.trim() : "");

    if (!reply) console.error("Unexpected Gemini response shape:", JSON.stringify(data, null, 2));

    return res.status(200).json({ reply: reply || "Sorry, I could not generate a response." });
  } catch (error) {
    console.error("Server error (Node):", error);
    const body = { error: "Server error" };
    if (error?.message) body.details = error.message;
    return res.status(500).json(body);
  }
}

// Helper to read raw body if req.body is not populated
function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function extractReply(data) {
  if (!data) return "";
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (typeof data?.response?.output_text === "string" && data.response.output_text.trim()) return data.response.output_text.trim();
  if (Array.isArray(data?.steps)) {
    const text = data.steps.map((step) => {
      if (!Array.isArray(step?.content)) return "";
      return step.content.map((part) => part?.text || "").join("");
    }).join("").trim();
    if (text) return text;
  }
  if (Array.isArray(data?.candidates)) {
    const text = data.candidates.map((candidate) => {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) return "";
      return parts.map((part) => part?.text || "").join("");
    }).join("").trim();
    if (text) return text;
  }
  if (Array.isArray(data?.output) && data.output.length > 0) {
    try {
      const t = data.output.map((o) => (Array.isArray(o?.content) ? o.content.map((c) => c?.text || "").join("") : "")).join("").trim();
      if (t) return t;
    } catch (e) {}
  }
  return "";
    }
