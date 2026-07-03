// api/chat.js
// Vercel-compatible API route for /api/chat
// Uses gemini-pro (free tier) with correct endpoint

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
      return res.status(400).json({ error: "Message is required" });
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
      console.error("❌ No API key found");
      return res.status(500).json({ error: "Missing GOOGLE_API_KEY" });
    }

    console.log("✅ API Key loaded");

    if (process.env.MOCK_REPLY === "true") {
      return res.status(200).json({ reply: "Mock reply" });
    }

    // For free tier: Use simpler prompt format
    const systemPrompt = `You are PassSabi AI, an AI teacher for students.
- Founded by Efezino Uzezi
- Help with homework, exams (WAEC, NECO, JAMB, GCE)
- Answer clearly, step by step
- Use plain text only`;

    console.log("📤 Calling Gemini API");

    // Use v1beta endpoint (correct for free tier)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: message }
            ]
          }
        ]
      })
    });

    console.log("📥 Status:", resp.status);

    const text = await resp.text();

    if (!resp.ok) {
      console.error("❌ API Error:", resp.status, text.substring(0, 200));
      return res.status(502).json({ 
        error: `Gemini API error: ${resp.status}`,
        details: text
      });
    }

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error("❌ Parse error");
      return res.status(502).json({ error: "Invalid response" });
    }

    const reply = extractReply(data);

    if (!reply) {
      console.error("❌ No reply found");
      return res.status(502).json({ error: "No response from Gemini" });
    }

    console.log("✅ Success!");
    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function extractReply(data) {
  if (!data) return "";
  
  if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
      return candidate.content.parts
        .map(p => p?.text || "")
        .join(" ")
        .trim();
    }
  }
  
  return "";
}
