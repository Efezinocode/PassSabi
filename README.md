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
2. Set environment variables in the Vercel project settings:
   - "GOOGLE_API_KEY" (or "GEMINI_API_KEY") — your Google Generative AI API key.
   - "MOCK_REPLY" (optional) = "true" to enable mock responses for development/testing.
3. Commit and redeploy.

API

- The server route "/api/chat" accepts "POST" requests with JSON:

{ "message": "..." }

- For quick mobile testing the API also supports "GET":

/api/chat?message=hello

(Debug only.)

Development Notes

- Do not expose API keys in client-side code. Always use server environment variables.
- Use "MOCK_REPLY=true" to avoid using API quota while developing.
- The chat UI saves history locally and shows server error text to help debugging.

Contributing

- Pull requests are welcome. Open an issue to discuss major changes.
- Please follow the coding style used in the repo and test changes locally if possible.

Credits

- Founder & developer: Uzezi Great Efezino (Efezino Uzezi)
- Repository: "PassSabi AI" (https://github.com/Efezinocode/PassSabi)

Contact

- GitHub: "Efezinocode" (https://github.com/Efezinocode)
- Website: "PassSabi AI" (https://passsabi.vercel.app)
