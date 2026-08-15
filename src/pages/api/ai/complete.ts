import { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { chatId, messages, userId } = req.body;
    if (!chatId || !messages || !userId) return res.status(400).json({ error: 'missing_fields' });

    // Call AI provider (OpenAI example)
    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages })
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      return res.status(502).json({ error: 'ai_error', detail: text });
    }

    const payload = await aiResp.json();
    const assistantText = payload?.choices?.[0]?.message?.content ?? '';

    // Persist assistant message server-side using service role
    await supabaseService.from('messages').insert([{ chat_id: chatId, user_id: userId, role: 'assistant', content: assistantText }]);
    await supabaseService.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);

    return res.status(200).json({ assistant: assistantText, raw: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
