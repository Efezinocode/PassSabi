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

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing GEMINI_API_KEY environment variable" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

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
            system_instruction: `
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
- Do not use unnecessary decoration.
- Use Markdown only when it helps readability.
- If asked who founded PassSabi AI, answer: Efezino Uzezi.
            `.trim(),
            input: message,
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
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
      return new Response(
        JSON.stringify({
          error: "Server error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
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

  const steps = Array.isArray(data?.steps) ? data.steps : [];

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const content = steps[i]?.content;

    if (Array.isArray(content)) {
      const text = content
        .map((part) => part?.text || "")
        .join("")
        .trim();

      if (text) {
        return text;
      }
    }
  }

  return "";
          }
