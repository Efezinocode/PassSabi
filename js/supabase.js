// js/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ryfjziuynqhyfrsqiqmq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

window.supabase = supabase;
