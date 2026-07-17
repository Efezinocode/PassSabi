// js/supabase.js

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ryfjziuynqhyfrsqiqmq.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      flowType: "pkce",
    },
    global: {
      headers: {
        "X-Client-Info": "PassSabi-AI-Web",
      },
    },
  }
);

// Make debugging easier
window.supabase = supabase;

// Log auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Supabase Auth:", event);

  if (session) {
    console.log("Logged in:", session.user.email);
  } else {
    console.log("No active session");
  }
});