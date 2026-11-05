# PassSabi AI

PassSabi AI is a student-focused learning assistant designed to help learners ask questions, understand difficult topics, and prepare for school and external examinations.

**Live application:** https://passsabi-ai.vercel.app/

## What this repository contains

This repository contains web application work for PassSabi AI, including:

- Landing, guest-chat, and signed-in application pages
- Account screens for registration, login, and password recovery
- Chat interface and API routes for AI responses
- Supabase client and authentication integration
- Profile and settings screens
- Progressive Web App assets and configuration

The deployed product and this repository may evolve at different speeds. Check the live application for the current product experience.

## Technology

- JavaScript and TypeScript
- Next.js and React
- Supabase
- Vercel serverless API routes
- HTML and CSS

## Local development

1. Install the project dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env.local` file and configure the Supabase and AI-provider environment variables required by the application.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Before submitting changes, run:

   ```bash
   npm run typecheck
   npm run build
   ```

## Security

- Never commit `.env.local`, API keys, access tokens, or service-role credentials.
- Keep privileged keys on the server. Never expose them in browser-side code.
- Use test accounts and non-production data during local development.

## Project direction

PassSabi AI is being developed iteratively. Features, interfaces, and integrations may change as the application is tested and improved.

---

Built by **Efezino Great Uzezi**.