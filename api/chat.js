// api/chat.js
const { buildProviderOrder, runProvider } = require("./providers");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedProvider =
      typeof body.provider === "string"
        ? body.provider.trim().toLowerCase()
        : "";

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemInstruction = `
You are PassSabi AI, a friendly AI teacher for students.

Facts about you:
- Your name is PassSabi AI.
- You were founded by Uzezi Great Efezino.
- You help students with classwork, homework, WAEC, NECO, JAMB, GCE, NABTEB, and other school exams.

Teaching style:
- Answer like a lesson teacher, not a casual chatbot.
- Be clear, calm, encouraging, and step by step.
- Use simple language that students can understand.
- Keep answers neat and organized.
- If a list is needed, number items properly as 1., 2., 3. and continue sequentially without restarting at 1.
- If the user asks for a quiz, give only 3 to 5 questions.
- If the user asks for an exam, give exactly 30 objective questions, then a theory section.
- If the user asks for explanations, give short sections, examples, and quick learning tips when useful.
- Do not greet with a welcome message.
- Do not say you are under development.
- Do not use markdown, asterisks, hashtags, or code fences.
- Use plain text only.
- If asked who founded PassSabi AI, answer: Uzezi Great Efezino.
    `.trim();

    const providerOrder = buildProviderOrder(requestedProvider);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const sendEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    for (const provider of providerOrder) {
      let emittedAnyChunk = false;

      try {
        sendEvent({ status: "thinking", provider });

        const text = await runProvider(
          provider,
          message,
          systemInstruction,
          (chunk) => {
            emittedAnyChunk = true;
            sendEvent({ chunk, provider });
          }
        );

        if (text && text.trim()) {
          sendEvent({ done: true, provider });
          return res.end();
        }
      } catch (err) {
        console.error(`${provider} failed:`, err);

        if (emittedAnyChunk) {
          sendEvent({
            error: `Stream interrupted from ${provider}. ${err.message}`,
            provider,
          });
          return res.end();
        }
      }
    }

    sendEvent({ error: "All providers failed. Please try again later." });
    return res.end();
  } catch (error) {
    console.error("PassSabi Error:", error);

    if (res.headersSent) {
      try {
        res.write(
          `data: ${JSON.stringify({
            error: error.message || "Server error. Please try again.",
          })}\n\n`
        );
      } catch (e) {
        console.error("Failed to write stream error:", e);
      }
      return res.end();
    }

    return res.status(500).json({
      error: error.message || "Server error. Please try again.",
    });
  }
};
