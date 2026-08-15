# Pull request: scaffold(phase-1): initial Next.js + Supabase Phase 1 scaffold

This PR adds the Phase 1 scaffold for PassSabi: a Next.js + TypeScript PWA scaffold with Supabase integration for authentication and database storage. It lays the foundation for a modular, secure, and mobile-first education app.

What’s included
- Next.js + TypeScript + Tailwind CSS scaffold
- Supabase client (anon key)
- authService (single source of truth for auth operations)
- chatService (Supabase-backed CRUD)
- Server AI proxy stub (server-side only; requires OPENAI_API_KEY & SUPABASE_SERVICE_ROLE_KEY)
- Basic auth pages: signup, login, forgot password, reset
- Dashboard placeholder (protected)
- Supabase migrations: schema.sql
- Supabase RLS policies: policies.sql
- PWA manifest
- README with setup & local dev instructions

Checklist (follow after merging)
- [ ] Run supabase SQL migrations in your Supabase project (supabase/migrations/schema.sql)
- [ ] Apply RLS policies (supabase/policies/policies.sql)
- [ ] Add environment variables in Vercel:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY (server-only)
  - OPENAI_API_KEY (server-only)
  - NEXT_PUBLIC_SITE_URL
- [ ] npm ci && npm run dev to smoke test locally
- [ ] Verify signup, login, session persistence, and protected pages

Notes
- Server-only secrets must be stored in Vercel and never exposed to the client.
- Review the SQL and RLS policies before applying to production. Adjust as necessary to match any existing schema.
- This PR intentionally focuses on Phase 1. Phase 2 will add chat UI, streaming, sidebar, and more.

If you want, I can run a follow-up PR to implement Phase 2 once this is merged.
