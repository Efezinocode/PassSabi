// api/chat.js
// Vercel-compatible API route for /api/chat
// Uses gemini-pro (free tier)

export default async function handler(req, res) {
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

    console.log("📤 Calling Gemini API with message:", message.substring(0, 50));

    // Use v1beta/generateContent endpoint (correct for gemini-pro)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    console.log("📤 URL:", url.substring(0, 80) + "...");

    // Correct payload format for gemini-pro
    const payload = {
      prompt: {
        text: message
      }
    };

    console.log("📤 Sending payload:", JSON.stringify(payload));

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("📥 Response status:", resp.status);

    const text = await resp.text();
    console.log("📥 Response body:", text.substring(0, 200));

    if (!resp.ok) {
      console.error("❌ API Error:", resp.status);
      console.error("❌ Full error:", text);
      return res.status(502).json({ 
        error: `Gemini API error: ${resp.status}`,
        details: text
      });
    }

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error("❌ JSON parse error:", e);
      return res.status(502).json({ error: "Invalid JSON response" });
    }

    console.log("📥 Parsed data structure:", JSON.stringify(data).substring(0, 200));

    const reply = extractReply(data);

    if (!reply) {
      console.error("❌ No reply extracted from:", JSON.stringify(data));
      return res.status(502).json({ error: "No response text found" });
    }

    console.log("✅ Success! Reply:", reply.substring(0, 100));
    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Catch error:", error.message);
    console.error("❌ Stack:", error.stack);
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
  
  // Try candidates format (modern Gemini API)
  if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
      const text = candidate.content.parts
        .map(p => p?.text || "")
        .join(" ")
        .trim();
      if (text) return text;
    }
  }

  // Try output (older format)
  if (Array.isArray(data?.outputs) && data.outputs.length > 0) {
    if (typeof data.outputs[0] === "string") return data.outputs[0];
  }

  // Try text field
  if (typeof data?.text === "string") return data.text.trim();

  return "";
}
