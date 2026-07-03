export default {
  async fetch(request) {
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

      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
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

      const geminiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            model: "gemini-3.5-flash",
            system_instruction: systemInstruction,
            input: message,
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini request failed:", errorText);

        return new Response(
          JSON.stringify({
            error: "Gemini request failed",
            details: errorText,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const data = await geminiResponse.json();
      const reply = extractReply(data);

      if (!reply) {
        console.error("Unexpected Gemini response shape:", JSON.stringify(data, null, 2));
      }

      return new Response(
        JSON.stringify({
          reply: reply || "Sorry, I could not generate a response.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Server error:", error);

      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

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
