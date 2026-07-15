// js/supabase.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==============================
// PASSSABI AI SUPABASE SETTINGS
// ==============================

const SUPABASE_URL = "https://ryfjziuynqhyfrsqiqmq.supabase.co/rest/v1/";

const SUPABASE_ANON_KEY = "sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU";

// Create Supabase client
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// Make it available everywhere
window.supabase = supabase;
