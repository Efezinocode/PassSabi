// js/storage.js
const STORAGE_KEY = "passsabi_chat_sessions_v1";
const CURRENT_CHAT_KEY = "passsabi_current_chat_id_v1";
const LEGACY_MESSAGES_KEY = "passsabi_messages_v1";

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeSession(session) {
  const safeId =
    typeof session?.id === "string" && session.id.trim()
      ? session.id.trim()
      : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const safeTitle =
    typeof session?.title === "string" && session.title.trim()
      ? session.title.trim()
      : "New Chat";

  const safeMessages = Array.isArray(session?.messages)
    ? session.messages
        .filter((message) => message && typeof message.text === "string")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          text: String(message.text),
          ts: typeof message.ts === "number" ? message.ts : Date.now(),
        }))
    : [];

  return {
    id: safeId,
    title: safeTitle,
    messages: safeMessages,
    createdAt: typeof session?.createdAt === "number" ? session.createdAt : Date.now(),
    updatedAt: typeof session?.updatedAt === "number" ? session.updatedAt : Date.now(),
    pinned: Boolean(session?.pinned),
  };
}

export function createSession(title = "New Chat") {
  return normalizeSession({
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  });
}

export function makeSessionTitle(message) {
  const clean = String(message || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 28 ? `${clean.slice(0, 28).trim()}…` : clean;
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = safeJsonParse(raw, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((session) => session && session.id && Array.isArray(session.messages))
      .map((session) => normalizeSession(session));
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  try {
    const ordered = Array.isArray(sessions)
      ? sessions.slice().sort((a, b) => {
          const pinnedA = a?.pinned ? 1 : 0;
          const pinnedB = b?.pinned ? 1 : 0;
          if (pinnedA !== pinnedB) return pinnedB - pinnedA;
          return (b?.updatedAt || 0) - (a?.updatedAt || 0);
        })
      : [];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
  } catch (error) {
    console.warn("Could not save chat sessions", error);
  }
}

export function loadCurrentChatId() {
  try {
    return localStorage.getItem(CURRENT_CHAT_KEY) || "";
  } catch {
    return "";
  }
}

export function saveCurrentChatId(chatId) {
  try {
    localStorage.setItem(CURRENT_CHAT_KEY, chatId || "");
  } catch (error) {
    console.warn("Could not save current chat id", error);
  }
}

export function migrateLegacyMessages() {
  try {
    const raw = localStorage.getItem(LEGACY_MESSAGES_KEY);
    if (!raw) return null;

    const parsed = safeJsonParse(raw, null);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const firstUser = parsed.find(
      (m) => m && m.role === "user" && typeof m.text === "string"
    );

    const title = firstUser ? makeSessionTitle(firstUser.text) : "Imported Chat";

    return normalizeSession({
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      messages: parsed.filter((m) => m && typeof m.text === "string"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    });
  } catch {
    return null;
  }
}

export function removeLegacyMessagesKey() {
  try {
    localStorage.removeItem(LEGACY_MESSAGES_KEY);
  } catch (error) {
    console.warn("Could not remove legacy messages", error);
  }
}

export function getStorageKeys() {
  return {
    STORAGE_KEY,
    CURRENT_CHAT_KEY,
    LEGACY_MESSAGES_KEY,
  };
}
