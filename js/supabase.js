import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://ryfjziuynqhyfrsqiqmq.supabase.co/rest/v1/'
const supabaseKey = 'sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU'

export const supabase = createClient(supabaseUrl, supabaseKey)
