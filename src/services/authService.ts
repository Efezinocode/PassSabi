import { supabase } from '../lib/supabaseClient';

export const authService = {
  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  },

  getUser: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  },

  signUp: (email: string, password: string) => {
    return supabase.auth.signUp({ email, password }, { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify` });
  },

  signIn: (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  },

  signOut: () => supabase.auth.signOut(),

  onAuthStateChange: (cb: (event: string, session: any) => void) => supabase.auth.onAuthStateChange((event, session) => cb(event, session))
};
