import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Minimal client-side auth listener used by hooks/components
    const { data: sub } = supabase.auth.onAuthStateChange(() => {});
    return () => sub.subscription.unsubscribe();
  }, []);

  return <Component {...pageProps} />;
}
