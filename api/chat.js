// Universal API handler supporting Cloudflare Workers (named export `fetch`) and Node/Vercel (default export handler)

const SYSTEM_INSTRUCTION = `
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

async function callGemini(apiKey, message) {
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "gemini-3.5-flash",
      system_instruction: SYSTEM_INSTRUCTION,
      input: message,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error("Gemini request failed:", errorText);
    const err = new Error("Gemini request failed");
    err.details = errorText;
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const reply = extractReply(data);
  return reply || "Sorry, I could not generate a response.";
}

// Cloudflare Pages / Workers entrypoint
export async function fetch(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = env?.GOOGLE_API_KEY || env?.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const reply = await callGemini(apiKey, message);

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Server error (Cloudflare):", error);
    const body = { error: "Server error" };
    if (error?.details) body.details = error.details;
    return new Response(JSON.stringify(body), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Vercel / Node entrypoint (default export)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Try common forms: req.body (if body parser is present) or raw stream
    const body = req.body && Object.keys(req.body).length ? req.body : await readRawBody(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) return res.status(400).json({ error: "Message is required" });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable" });
    }

    const reply = await callGemini(apiKey, message);
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Server error (Node):", error);
    const body = { error: "Server error" };
    if (error?.details) body.details = error.details;
    return res.status(500).json(body);
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
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
    req.on("error", reject);
  });
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
        return step.content
          .map((part) => part?.text || "")
          .join("");
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
