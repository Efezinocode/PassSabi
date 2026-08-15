import { supabase } from '../lib/supabaseClient';

export const chatService = {
  createChat: async (user_id: string, title?: string) => {
    const { data, error } = await supabase.from('chats').insert([{ user_id, title: title ?? 'New Chat' }]).select().single();
    if (error) throw error;
    return data;
  },

  getChatsForUser: async (user_id: string) => {
    const { data, error } = await supabase.from('chats').select('*').eq('user_id', user_id).order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  addMessage: async (chat_id: string, user_id: string | null, role: string, content: string) => {
    const { data, error } = await supabase.from('messages').insert([{ chat_id, user_id, role, content }]).select().single();
    if (error) throw error;
    return data;
  }
};
