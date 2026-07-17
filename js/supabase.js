// js/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL =
  window.__PASSSABI_SUPABASE_URL__ ||
  "https://ryfjziuynqhyfrsqiqmq.supabase.co";

const SUPABASE_ANON_KEY =
  window.__PASSSABI_SUPABASE_ANON_KEY__ ||
  "sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase config is missing.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
  global: {
    headers: {
      "X-Client-Info": "PassSabi-AI-Web",
    },
  },
});

// Helpful for debugging in the browser console
window.supabase = supabase;