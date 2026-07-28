PassSabi AI

PassSabi AI — An AI-powered learning assistant that helps students prepare for school and national exams with clear, step-by-step explanations, practice questions, and personalized study support.

"Live demo" (https://passsabi.vercel.app)

Author: Uzezi Great Efezino (aka Efezino Uzezi) — Founder of PassSabi AI

Overview

- Teach students step-by-step explanations, not just answers.
- Help with homework, practice questions, and exam prep for WAEC, NECO, JAMB, GCE, NABTEB, and school exams.
- Focus on learning, understanding, and academic integrity.

Quick Start (Vercel)

1. Deploy this repo to Vercel (recommended).
2. Set environment variables in the Vercel project settings. At least one provider key is required — the app tries providers in order and falls back automatically:
   - "XAI_API_KEY" — xAI (Grok) key. Also supports "XAI_MODEL", "XAI_MODEL_FALLBACKS".
   - "GROQ_API_KEY" — Groq key. Also supports "GROQ_MODEL", "GROQ_MODEL_FALLBACKS".
   - "OPENAI_API_KEY" — OpenAI key. Also supports "OPENAI_MODEL", "OPENAI_MODEL_FALLBACKS", "OPENAI_WEB_SEARCH".
   - "GEMINI_API_KEY" (or "GOOGLE_API_KEY") — Google Gemini key. Also supports "GEMINI_MODEL", "GEMINI_MODEL_FALLBACKS".
   - "MOCK_REPLY" (optional) = "true" to return a canned mock reply instead of calling any provider — use this while developing so you don't burn quota.
   - "ALLOWED_ORIGINS" (optional) — comma-separated list of extra origins allowed to call "/api/chat" (your own deployment's Vercel URL and "https://passsabi.vercel.app" are always allowed automatically).
   - "ENABLE_DEBUG_GET" (optional) = "true" to turn on the "GET /api/chat?message=" debug shortcut below. Leave unset/false in production.
3. Commit and redeploy.

API

- The server route "/api/chat" accepts "POST" requests with JSON. Either a single message:

{ "message": "..." }

  or, to give the model real conversation history, a messages array:

{ "messages": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }], "systemPrompt": "...", "provider": "xai" }

- "/api/chat" is reachable without login (guests can chat too), so it's protected with an Origin allowlist, a per-IP rate limit, and clamped "temperature"/"maxTokens"/"provider" values — not by a user session.

- For quick local testing the API also supports "GET":

/api/chat?message=hello

(Debug only — disabled unless "ENABLE_DEBUG_GET=true" is set, so it can't be used as a free unmetered endpoint in production.)

Development Notes

- Do not expose API keys in client-side code. Always use server environment variables.
- Use "MOCK_REPLY=true" to avoid using API quota while developing.
- The chat UI saves history locally and shows server error text to help debugging.
- The in-memory rate limiter in "api/chat.js" is best-effort per warm serverless instance. For real production-grade rate limiting, back it with a durable store (Vercel KV, Upstash Redis, or a Supabase table) instead.

Contributing

- Pull requests are welcome. Open an issue to discuss major changes.
- Please follow the coding style used in the repo and test changes locally if possible.

Credits

- Founder & developer: Uzezi Great Efezino (Efezino Uzezi)
- (https://uzezigreatefezino.vercel.app/)
- Repository: "PassSabi AI" (https://github.com/Efezinocode/PassSabi)

Contact

- GitHub: "Efezinocode" (https://github.com/Efezinocode)
- Website: "PassSabi AI" (https://passsabi.vercel.app)