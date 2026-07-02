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

      const prompt = `You are PassSabi AI, a friendly personal AI teacher for students.
Explain clearly, step by step, and use simple language.
Keep answers helpful, safe, and easy to understand.

Student question: ${message}`;

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
            system_instruction: "You are PassSabi AI, a friendly AI teacher for students.",
            input: prompt,
            generation_config: {
              temperature: 0.7,
            },
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

      const steps = Array.isArray(data.steps) ? data.steps : [];
      const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;

      let reply =
        typeof data.output_text === "string" ? data.output_text.trim() : "";

      if (!reply && lastStep && Array.isArray(lastStep.content)) {
        reply = lastStep.content
          .map((part) => part?.text || "")
          .join("")
          .trim();
      }

      if (!reply) {
        reply = "Sorry, I could not generate a response.";
      }

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
