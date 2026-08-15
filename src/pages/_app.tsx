import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function makeBox({
  title,
  message,
  filename,
  lineno,
  colno,
  color = '#ff5555'
}: {
  title: string;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  color?: string;
}) {
  const box = document.createElement('div');

  box.style.cssText = `
    position:fixed;
    z-index:999999;
    left:10px;
    right:10px;
    bottom:10px;
    padding:15px;
    background:#111;
    color:${color};
    border:2px solid ${color};
    border-radius:10px;
    font-family:monospace;
    font-size:14px;
    white-space:pre-wrap;
    max-height:45vh;
    overflow:auto;
  `;

  let text = `${title}\n\n`;
  text += `Message: ${message}\n`;
  if (filename) text += `File: ${filename}\n`;
  if (typeof lineno !== 'undefined') text += `Line: ${lineno}\n`;
  if (typeof colno !== 'undefined') text += `Column: ${colno}\n`;

  box.textContent = text;

  // Allow click to dismiss
  box.addEventListener('click', () => box.remove());

  document.body.appendChild(box);
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Minimal client-side auth listener used by hooks/components
    const { data: sub } = supabase.auth.onAuthStateChange(() => {});

    const onError = (event: ErrorEvent) => {
      try {
        makeBox({
          title: '❌ JAVASCRIPT ERROR',
          message: event.message || String(event.error || 'Unknown error'),
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          color: '#ff5555'
        });
      } catch (e) {
        // swallow
        // eslint-disable-next-line no-console
        console.error('Error rendering error box', e);
      }
    };

    const onRejection = (event: any) => {
      try {
        const reason = event?.reason ?? 'Unknown rejection';
        const message = String(reason?.message ?? reason);
        makeBox({
          title: '⚠️ UNHANDLED PROMISE ERROR',
          message,
          color: '#ff9900'
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error rendering rejection box', e);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection as EventListener);

    return () => {
      try {
        sub?.subscription?.unsubscribe();
      } catch (e) {
        // ignore
      }
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection as EventListener);
    };
  }, []);

  return <Component {...pageProps} />;
}
