// js/storage.js
const STORAGE_KEY = "passsabi_chat_sessions_v1";
const CURRENT_CHAT_KEY = "passsabi_current_chat_id_v1";
const LEGACY_MESSAGES_KEY = "passsabi_messages_v1";
const MEMORY_KEY = "passsabi_memory_v1";
const AUTH_USER_KEY = "passsabi_user_v1";

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function makeId(prefix = "item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function capText(value, max = 120) {
  const text = cleanText(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function readStoredUser() {
  const user = safeJsonParse(localStorage.getItem(AUTH_USER_KEY), null);
  return user && typeof user === "object" ? user : null;
}

export function getActiveUserId() {
  return String(readStoredUser()?.id || "").trim();
}

export function getStorageScopeSuffix() {
  const userId = getActiveUserId();
  return userId ? `:${userId}` : "";
}

export function getScopedStorageKey(baseKey) {
  return `${baseKey}${getStorageScopeSuffix()}`;
}

export function isLoggedIn() {
  return !!getActiveUserId();
}

export function normalizeSession(session) {
  const safeId =
    typeof session?.id === "string" && session.id.trim()
      ? session.id.trim()
      : makeId("chat");

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
    pinned: !!session?.pinned,
    createdAt:
      typeof session?.createdAt === "number" ? session.createdAt : Date.now(),
    updatedAt:
      typeof session?.updatedAt === "number" ? session.updatedAt : Date.now(),
    messages: safeMessages,
  };
}

function readList(key) {
  const data = safeJsonParse(localStorage.getItem(key), []);
  return Array.isArray(data) ? data : [];
}

function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function scopedSessionKey() {
  return getScopedStorageKey(STORAGE_KEY);
}

function scopedCurrentChatKey() {
  return getScopedStorageKey(CURRENT_CHAT_KEY);
}

function scopedMemoryKey() {
  return getScopedStorageKey(MEMORY_KEY);
}

export function createSession(title = "New Chat") {
  return normalizeSession({
    id: makeId("chat"),
    title,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  });
}

export function loadSessions() {
  const sessions = readList(scopedSessionKey());
  return sessions.map(normalizeSession).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSessions(sessions) {
  const safeSessions = Array.isArray(sessions) ? sessions.map(normalizeSession) : [];
  writeList(scopedSessionKey(), safeSessions);
  return safeSessions;
}

export function loadCurrentChatId() {
  const value = localStorage.getItem(scopedCurrentChatKey());
  return value && String(value).trim() ? String(value).trim() : "";
}

export function saveCurrentChatId(chatId) {
  const id = String(chatId || "").trim();
  if (!id) {
    localStorage.removeItem(scopedCurrentChatKey());
    return "";
  }
  localStorage.setItem(scopedCurrentChatKey(), id);
  return id;
}

export function makeSessionTitle(text = "") {
  const cleaned = cleanText(text);
  if (!cleaned) return "New Chat";

  const words = cleaned.split(" ").filter(Boolean);
  const title = words.slice(0, 6).join(" ");
  return capText(title, 48) || "New Chat";
}

export function migrateGuestDataToUser() {
  const userId = getActiveUserId();
  if (!userId) return false;

  const guestSessions = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  const guestCurrent = localStorage.getItem(CURRENT_CHAT_KEY);
  const guestMemory = safeJsonParse(localStorage.getItem(MEMORY_KEY), null);

  const userSessionsKey = `${STORAGE_KEY}:${userId}`;
  const userCurrentKey = `${CURRENT_CHAT_KEY}:${userId}`;
  const userMemoryKey = `${MEMORY_KEY}:${userId}`;

  const existingSessions = safeJsonParse(localStorage.getItem(userSessionsKey), []);
  const mergedSessions = Array.isArray(existingSessions) && existingSessions.length
    ? existingSessions
    : Array.isArray(guestSessions)
      ? guestSessions
      : [];

  if (mergedSessions.length) {
    localStorage.setItem(userSessionsKey, JSON.stringify(mergedSessions.map(normalizeSession)));
  }

  if (guestCurrent && !localStorage.getItem(userCurrentKey)) {
    localStorage.setItem(userCurrentKey, String(guestCurrent));
  }

  if (guestMemory && !localStorage.getItem(userMemoryKey)) {
    localStorage.setItem(userMemoryKey, JSON.stringify(guestMemory));
  }

  return true;
}

export function migrateLegacyMessages() {
  const legacy = safeJsonParse(localStorage.getItem(LEGACY_MESSAGES_KEY), []);
  if (!Array.isArray(legacy) || !legacy.length) return false;

  const sessions = loadSessions();
  const session = createSession("Imported Chat");

  session.messages = legacy
    .filter((message) => message && typeof message.text === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      text: String(message.text),
      ts: typeof message.ts === "number" ? message.ts : Date.now(),
    }));

  session.title = makeSessionTitle(session.messages[0]?.text || "Imported Chat");
  session.updatedAt = Date.now();

  sessions.unshift(session);
  saveSessions(sessions);
  saveCurrentChatId(session.id);

  return true;
}

export function removeLegacyMessagesKey() {
  localStorage.removeItem(LEGACY_MESSAGES_KEY);
}

export function loadMemory() {
  const memory = safeJsonParse(localStorage.getItem(scopedMemoryKey()), {});
  if (!memory || typeof memory !== "object") {
    return {
      profile: {},
      preferences: {},
      facts: [],
      updatedAt: Date.now(),
    };
  }

  return {
    profile: memory.profile && typeof memory.profile === "object" ? memory.profile : {},
    preferences:
      memory.preferences && typeof memory.preferences === "object"
        ? memory.preferences
        : {},
    facts: Array.isArray(memory.facts) ? memory.facts : [],
    updatedAt: typeof memory.updatedAt === "number" ? memory.updatedAt : Date.now(),
  };
}

export function saveMemory(memory) {
  const safeMemory = {
    profile: memory?.profile && typeof memory.profile === "object" ? memory.profile : {},
    preferences:
      memory?.preferences && typeof memory.preferences === "object"
        ? memory.preferences
        : {},
    facts: Array.isArray(memory?.facts) ? memory.facts : [],
    updatedAt: Date.now(),
  };

  localStorage.setItem(scopedMemoryKey(), JSON.stringify(safeMemory));
  return safeMemory;
}

export function updateMemoryFromMessage(messageText) {
  const text = cleanText(messageText);
  if (!text) return loadMemory();

  const memory = loadMemory();

  const nameMatch = text.match(
    /\b(my name is|call me|i am|i'm)\s+([A-Za-z][A-Za-z0-9._ -]{1,40})/i
  );
  if (nameMatch) {
    memory.profile.name = capText(nameMatch[2], 40);
  }

  const schoolMatch = text.match(
    /\b(my school is|i attend|i go to)\s+([A-Za-z][A-Za-z0-9._ -]{1,60})/i
  );
  if (schoolMatch) {
    memory.profile.school = capText(schoolMatch[2], 60);
  }

  const classMatch = text.match(
    /\b(i am in|my class is|i'm in)\s+([A-Za-z0-9._ -]{1,30})/i
  );
  if (classMatch) {
    memory.profile.classLevel = capText(classMatch[2], 30);
  }

  const toneMatch = text.match(/\b(use|prefer)\s+(simple|friendly|formal|short|long)\s+(answers|response|responses)?/i);
  if (toneMatch) {
    memory.preferences.tone = toneMatch[2].toLowerCase();
  }

  const langMatch = text.match(/\b(english|yoruba|igbo|hausa|pidgin)\b/i);
  if (langMatch) {
    memory.preferences.language = langMatch[1].toLowerCase();
  }

  const lengthMatch = text.match(/\b(short|medium|long)\s+(answers|response|responses)\b/i);
  if (lengthMatch) {
    memory.preferences.answerLength = lengthMatch[1].toLowerCase();
  }

  const lower = text.toLowerCase();
  const factKeywords = [
    "exam",
    "waec",
    "neco",
    "jamb",
    "nabteb",
    "physics",
    "chemistry",
    "biology",
    "math",
    "mathematics",
    "english",
    "government",
    "economics",
    "commerce",
    "accounting",
    "literature",
    "history",
  ];

  const matchedKeyword = factKeywords.find((keyword) => lower.includes(keyword));
  if (matchedKeyword) {
    const fact = {
      id: makeId("fact"),
      label: capText(matchedKeyword, 40),
      value: capText(text, 180),
      ts: Date.now(),
    };
    const facts = Array.isArray(memory.facts) ? memory.facts : [];
    facts.push(fact);
    memory.facts = facts.slice(-20);
  }

  return saveMemory(memory);
}

export function buildMemoryPrompt() {
  const memory = loadMemory();
  const lines = [];

  if (memory.profile && Object.keys(memory.profile).length) {
    lines.push("Profile:");
    if (memory.profile.name) lines.push(`- Name: ${memory.profile.name}`);
    if (memory.profile.school) lines.push(`- School: ${memory.profile.school}`);
    if (memory.profile.classLevel) lines.push(`- Class: ${memory.profile.classLevel}`);
  }

  if (memory.preferences && Object.keys(memory.preferences).length) {
    lines.push("Preferences:");
    if (memory.preferences.tone) lines.push(`- Tone: ${memory.preferences.tone}`);
    if (memory.preferences.language) lines.push(`- Language: ${memory.preferences.language}`);
    if (memory.preferences.answerLength) {
      lines.push(`- Answer length: ${memory.preferences.answerLength}`);
    }
  }

  const recentFacts = Array.isArray(memory.facts) ? memory.facts.slice(-8) : [];
  if (recentFacts.length) {
    lines.push("Remembered facts:");
    recentFacts.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}`);
    });
  }

  return lines.length ? `Known user memory:\n${lines.join("\n")}` : "";
}

export function clearMemory() {
  try {
    localStorage.removeItem(scopedMemoryKey());
  } catch (error) {
    console.warn("Could not clear memory", error);
  }
}

export function getStorageKeys() {
  return {
    STORAGE_KEY,
    CURRENT_CHAT_KEY,
    LEGACY_MESSAGES_KEY,
    MEMORY_KEY,
    AUTH_USER_KEY,
    scoped: {
      sessions: scopedSessionKey(),
      currentChat: scopedCurrentChatKey(),
      memory: scopedMemoryKey(),
    },
  };
}
