// js/supabase.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==============================
// PASSSABI AI SUPABASE SETTINGS
// ==============================

const SUPABASE_URL = "https://ryfjziuynqhyfrsqiqmq.supabase.co";

const SUPABASE_ANON_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

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
