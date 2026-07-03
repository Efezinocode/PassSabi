// api/chat.js
// Vercel-compatible API route for /api/chat
// Uses gemini-pro (free tier)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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
  } else if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      const body = req.body && Object.keys(req.body).length ? req.body : await readRawBody(req);
      message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("❌ ERROR: No API key found");
      return res.status(500).json({ 
        error: "Missing GOOGLE_API_KEY environment variable",
        details: "Set GOOGLE_API_KEY in Vercel project settings"
      });
    }

    console.log("✅ API Key found");

    if (process.env.MOCK_REPLY === "true") {
      return res.status(200).json({ reply: "This is a mock reply." });
    }

    // System instruction for gemini-pro (free tier)
    const systemPrompt = `You are PassSabi AI, a friendly AI teacher for students.

Facts about you:
- Your name is PassSabi AI.
- You were founded by Efezino Uzezi.
- You help students with classwork, homework, WAEC, NECO, JAMB, GCE, NABTEB, and other school exams.

Style rules:
- Answer clearly and step by step.
- Be helpful, calm, and professional.
- Do not greet with a welcome message.
- Do not say you are under development.
- Use plain text only.
- If a list is needed, use simple numbered lines like 1. 2. 3.
- If asked who founded PassSabi AI, answer: Efezino Uzezi.`;

    // For gemini-pro (free tier), add system instruction as first message
    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }]
      },
      {
        role: "model",
        parts: [{ text: "I understand. I'm PassSabi AI, ready to help students learn." }]
      },
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    console.log("📤 Calling Gemini API (gemini-pro - free tier)");

    // Use gemini-pro for free tier
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    console.log("📥 Response status:", resp.status);

    const text = await resp.text();

    if (!resp.ok) {
      console.error("❌ Gemini API error:", resp.status, text.substring(0, 200));
      return res.status(502).json({ 
        error: "Gemini API failed",
        status: resp.status,
        details: text.substring(0, 300)
      });
    }

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error("❌ JSON parse error:", text.substring(0, 100));
      return res.status(502).json({ error: "Invalid response from Gemini" });
    }

    const reply = extractReply(data);

    if (!reply) {
      console.error("❌ No reply extracted from:", JSON.stringify(data).substring(0, 200));
      return res.status(502).json({ error: "No response from Gemini" });
    }

    console.log("✅ Success! Reply length:", reply.length);
    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Server error:", error.message);
    return res.status(500).json({ 
      error: "Server error",
      details: error.message 
    });
  }
}

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
  
  // Gemini API returns response in candidates[].content.parts[].text
  if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
      const texts = candidate.content.parts
        .map(part => part?.text || "")
        .filter(t => t.trim().length > 0);
      if (texts.length > 0) {
        return texts.join(" ").trim();
      }
    }
  }
  
  return "";
}
