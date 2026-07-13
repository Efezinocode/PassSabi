const { buildProviderOrder, runProvider } = require("./providers");

function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }

  return {};
}

function sendSseEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, max = 220) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function buildConversationContext(history, limit = 8) {
  if (!Array.isArray(history) || history.length === 0) return "";

  const lines = history
    .slice(-limit)
    .map((item) => {
      const role = item?.role === "assistant" ? "Assistant" : "User";
      const text = truncateText(item?.text || "", 260);
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : "";
}

function buildSystemInstruction(memoryContext = "", conversationContext = "") {
  const base = `
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
- Use simple markdown when helpful:
  - headings
  - bullet points
  - numbered lists
  - short code blocks only when needed
- Do not overuse symbols.
- If asked who founded PassSabi AI, answer: Uzezi Great Efezino.
- If memory shows the user's name or preferences, use them naturally and respectfully.
`.trim();

  const parts = [base];

  if (memoryContext) {
    parts.push(`Known user memory:\n${cleanText(memoryContext)}`);
  }

  if (conversationContext) {
    parts.push(`Recent conversation context:\n${conversationContext}`);
  }

  return parts.join("\n\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedProvider =
      typeof body.provider === "string"
        ? body.provider.trim().toLowerCase()
        : "";
    const memoryContext = typeof body.memory === "string" ? body.memory.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemInstruction = buildSystemInstruction(
      memoryContext,
      buildConversationContext(history)
    );
    const providerOrder = buildProviderOrder(requestedProvider);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let finished = false;

    for (const provider of providerOrder) {
      let emittedAnyChunk = false;

      try {
        sendSseEvent(res, { status: "thinking", provider });

        const text = await runProvider(provider, message, systemInstruction, (chunk) => {
          if (chunk == null || finished) return;

          emittedAnyChunk = true;
          sendSseEvent(res, {
            chunk: String(chunk),
            provider,
          });
        });

        if (finished) return res.end();

        const finalText = typeof text === "string" ? text.trim() : "";

        if (finalText) {
          if (!emittedAnyChunk) {
            sendSseEvent(res, {
              chunk: finalText,
              provider,
            });
          }

          sendSseEvent(res, {
            done: true,
            provider,
          });

          finished = true;
          return res.end();
        }
      } catch (err) {
        console.error(`${provider} failed:`, err);

        if (emittedAnyChunk && !finished) {
          sendSseEvent(res, {
            error: `Stream interrupted from ${provider}. ${
              err?.message || "Unknown error"
            }`,
            provider,
          });
          finished = true;
          return res.end();
        }
      }
    }

    if (!finished) {
      sendSseEvent(res, {
        error: "All providers failed. Please try again later.",
      });
      return res.end();
    }

    return res.end();
  } catch (error) {
    console.error("PassSabi Error:", error);

    if (res.headersSent) {
      try {
        sendSseEvent(res, {
          error: error?.message || "Server error. Please try again.",
        });
      } catch (writeErr) {
        console.error("Failed to write stream error:", writeErr);
      }
      return res.end();
    }

    return res.status(500).json({
      error: error?.message || "Server error. Please try again.",
    });
  }
};