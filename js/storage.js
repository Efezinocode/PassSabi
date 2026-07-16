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

function safeStorageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
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
  const user = safeJsonParse(safeStorageGet(localStorage, AUTH_USER_KEY), null);
  return user && typeof user === "object" ? user : null;
}

export function getActiveUserId() {
  return String(readStoredUser()?.id || "").trim();
}

export function isLoggedIn() {
  return !!getActiveUserId();
}

export function getDataStorage() {
  return isLoggedIn() ? localStorage : sessionStorage;
}

export function getStorageScopeSuffix() {
  const userId = getActiveUserId();
  return userId ? `:${userId}` : "";
}

export function getScopedStorageKey(baseKey) {
  return `${baseKey}${getStorageScopeSuffix()}`;
}

function readJsonKey(key, fallback = null) {
  const storage = getDataStorage();
  const raw = safeStorageGet(storage, key);

  if (raw !== null) {
    const parsed = safeJsonParse(raw, fallback);
    return parsed === undefined ? fallback : parsed;
  }

  if (!isLoggedIn()) {
    const legacyRaw = safeStorageGet(localStorage, key);
    if (legacyRaw !== null) {
      safeStorageSet(sessionStorage, key, legacyRaw);
      safeStorageRemove(localStorage, key);
      const parsed = safeJsonParse(legacyRaw, fallback);
      return parsed === undefined ? fallback : parsed;
    }
  }

  return fallback;
}

function writeJsonKey(key, value) {
  const storage = getDataStorage();
  if (value == null) {
    safeStorageRemove(storage, key);
    return;
  }
  safeStorageSet(storage, key, JSON.stringify(value));
}

function readStringKey(key) {
  const storage = getDataStorage();
  const value = safeStorageGet(storage, key);

  if (value !== null && String(value).trim()) {
    return String(value).trim();
  }

  if (!isLoggedIn()) {
    const legacyValue = safeStorageGet(localStorage, key);
    if (legacyValue && String(legacyValue).trim()) {
      safeStorageSet(sessionStorage, key, String(legacyValue));
      safeStorageRemove(localStorage, key);
      return String(legacyValue).trim();
    }
  }

  return "";
}

function writeStringKey(key, value) {
  const storage = getDataStorage();
  const safeValue = String(value || "").trim();

  if (!safeValue) {
    safeStorageRemove(storage, key);
    return "";
  }

  safeStorageSet(storage, key, safeValue);
  return safeValue;
}

function getMessageText(message) {
  if (!message || typeof message !== "object") return "";
  return String(message.text ?? message.content ?? "").trim();
}

function normalizeMessage(message) {
  const text = getMessageText(message);
  if (!text) return null;

  return {
    role:
      message.role === "assistant" ||
      message.role === "system" ||
      message.role === "developer"
        ? message.role
        : "user",
    text,
    ts: typeof message.ts === "number" ? message.ts : Date.now(),
  };
}

function dedupeMessages(messages) {
  const out = [];
  let lastKey = "";

  for (const message of Array.isArray(messages) ? messages : []) {
    const normalized = normalizeMessage(message);
    if (!normalized) continue;

    const key = `${normalized.role}|${normalized.text}|${normalized.ts}`;
    const last = out[out.length - 1];

    if (last && last.role === normalized.role && last.text === normalized.text) {
      continue;
    }

    if (key === lastKey) {
      continue;
    }

    lastKey = key;
    out.push(normalized);
  }

  return out;
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

  const safeMessages = dedupeMessages(session?.messages);

  const createdAt =
    typeof session?.createdAt === "number" ? session.createdAt : Date.now();
  const updatedAt =
    typeof session?.updatedAt === "number" ? session.updatedAt : createdAt;

  return {
    id: safeId,
    title: safeTitle,
    pinned: !!session?.pinned,
    createdAt,
    updatedAt,
    messages: safeMessages,
  };
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
  const sessions = readJsonKey(scopedSessionKey(), []);
  return (Array.isArray(sessions) ? sessions : [])
    .map(normalizeSession)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSessions(sessions) {
  const safeSessions = Array.isArray(sessions) ? sessions.map(normalizeSession) : [];

  const unique = [];
  const seen = new Set();

  for (const session of safeSessions) {
    if (!session?.id) continue;
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    unique.push(session);
  }

  unique.sort((a, b) => b.updatedAt - a.updatedAt);
  writeJsonKey(scopedSessionKey(), unique);
  return unique;
}

export function loadCurrentChatId() {
  return readStringKey(scopedCurrentChatKey());
}

export function saveCurrentChatId(chatId) {
  return writeStringKey(scopedCurrentChatKey(), chatId);
}

export function makeSessionTitle(text = "") {
  const cleaned = cleanText(text);
  if (!cleaned) return "New Chat";

  const words = cleaned.split(" ").filter(Boolean);
  const title = words.slice(0, 6).join(" ");
  return capText(title, 48) || "New Chat";
}

function readLegacyGuestValue(baseKey, fallback) {
  const sessionRaw = safeStorageGet(sessionStorage, baseKey);
  if (sessionRaw !== null) {
    return safeJsonParse(sessionRaw, fallback);
  }

  const localRaw = safeStorageGet(localStorage, baseKey);
  if (localRaw !== null) {
    safeStorageSet(sessionStorage, baseKey, localRaw);
    safeStorageRemove(localStorage, baseKey);
    return safeJsonParse(localRaw, fallback);
  }

  return fallback;
}

function readLegacyGuestString(baseKey) {
  const sessionValue = safeStorageGet(sessionStorage, baseKey);
  if (sessionValue && String(sessionValue).trim()) {
    return String(sessionValue).trim();
  }

  const localValue = safeStorageGet(localStorage, baseKey);
  if (localValue && String(localValue).trim()) {
    safeStorageSet(sessionStorage, baseKey, String(localValue));
    safeStorageRemove(localStorage, baseKey);
    return String(localValue).trim();
  }

  return "";
}

export function migrateGuestDataToUser() {
  const userId = getActiveUserId();
  if (!userId) return false;

  const userSessionsKey = `${STORAGE_KEY}:${userId}`;
  const userCurrentKey = `${CURRENT_CHAT_KEY}:${userId}`;
  const userMemoryKey = `${MEMORY_KEY}:${userId}`;

  const scopedSessions = safeJsonParse(safeStorageGet(localStorage, userSessionsKey), []);
  const scopedCurrent = safeStorageGet(localStorage, userCurrentKey);
  const scopedMemory = safeJsonParse(safeStorageGet(localStorage, userMemoryKey), null);

  const guestSessions = readLegacyGuestValue(STORAGE_KEY, []);
  const guestCurrent = readLegacyGuestString(CURRENT_CHAT_KEY);
  const guestMemory = readLegacyGuestValue(MEMORY_KEY, null);

  const normalizedExisting = Array.isArray(scopedSessions)
    ? scopedSessions.map(normalizeSession)
    : [];

  const normalizedGuest = Array.isArray(guestSessions)
    ? guestSessions.map(normalizeSession)
    : [];

  const byId = new Map();
  [...normalizedExisting, ...normalizedGuest].forEach((session) => {
    if (!session?.id) return;
    byId.set(session.id, session);
  });

  const mergedSessions = Array.from(byId.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  if (mergedSessions.length) {
    safeStorageSet(localStorage, userSessionsKey, JSON.stringify(mergedSessions));
  }

  const currentCandidate =
    (guestCurrent && byId.has(guestCurrent) && guestCurrent) ||
    (scopedCurrent && byId.has(scopedCurrent) && scopedCurrent) ||
    mergedSessions[0]?.id ||
    "";

  if (currentCandidate) {
    safeStorageSet(localStorage, userCurrentKey, String(currentCandidate));
  }

  const existingMemory =
    scopedMemory && typeof scopedMemory === "object" ? scopedMemory : {};
  const guestMemorySafe =
    guestMemory && typeof guestMemory === "object" ? guestMemory : {};

  const mergedMemory = {
    profile: {
      ...(existingMemory.profile && typeof existingMemory.profile === "object"
        ? existingMemory.profile
        : {}),
      ...(guestMemorySafe.profile && typeof guestMemorySafe.profile === "object"
        ? guestMemorySafe.profile
        : {}),
    },
    preferences: {
      ...(existingMemory.preferences && typeof existingMemory.preferences === "object"
        ? existingMemory.preferences
        : {}),
      ...(guestMemorySafe.preferences && typeof guestMemorySafe.preferences === "object"
        ? guestMemorySafe.preferences
        : {}),
    },
    facts: [
      ...(Array.isArray(existingMemory.facts) ? existingMemory.facts : []),
      ...(Array.isArray(guestMemorySafe.facts) ? guestMemorySafe.facts : []),
    ].slice(-20),
    updatedAt: Date.now(),
  };

  safeStorageSet(localStorage, userMemoryKey, JSON.stringify(mergedMemory));

  safeStorageRemove(sessionStorage, STORAGE_KEY);
  safeStorageRemove(sessionStorage, CURRENT_CHAT_KEY);
  safeStorageRemove(sessionStorage, MEMORY_KEY);

  safeStorageRemove(localStorage, STORAGE_KEY);
  safeStorageRemove(localStorage, CURRENT_CHAT_KEY);
  safeStorageRemove(localStorage, MEMORY_KEY);

  return true;
}

export function migrateLegacyMessages() {
  const legacy = safeJsonParse(safeStorageGet(localStorage, LEGACY_MESSAGES_KEY), []);
  if (!Array.isArray(legacy) || !legacy.length) return false;

  const sessions = loadSessions();
  const session = createSession("Imported Chat");

  session.messages = legacy
    .map(normalizeMessage)
    .filter(Boolean);

  session.title = makeSessionTitle(session.messages[0]?.text || "Imported Chat");
  session.updatedAt = Date.now();

  sessions.unshift(session);
  saveSessions(sessions);
  saveCurrentChatId(session.id);

  return true;
}

export function removeLegacyMessagesKey() {
  safeStorageRemove(localStorage, LEGACY_MESSAGES_KEY);
}

export function loadMemory() {
  const memory = readJsonKey(scopedMemoryKey(), {});

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
  if (!isLoggedIn()) {
    return {
      profile: {},
      preferences: {},
      facts: [],
      updatedAt: Date.now(),
    };
  }

  const safeMemory = {
    profile: memory?.profile && typeof memory.profile === "object" ? memory.profile : {},
    preferences:
      memory?.preferences && typeof memory.preferences === "object"
        ? memory.preferences
        : {},
    facts: Array.isArray(memory?.facts) ? memory.facts : [],
    updatedAt: Date.now(),
  };

  writeJsonKey(scopedMemoryKey(), safeMemory);
  return safeMemory;
}

function dedupeFacts(facts) {
  const out = [];
  const seen = new Set();

  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!fact || typeof fact !== "object") continue;
    const key = `${cleanText(fact.label)}|${cleanText(fact.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: fact.id || makeId("fact"),
      label: capText(fact.label, 40),
      value: capText(fact.value, 180),
      ts: typeof fact.ts === "number" ? fact.ts : Date.now(),
    });
  }

  return out.slice(-20);
}

export function updateMemoryFromMessage(messageText) {
  if (!isLoggedIn()) {
    return loadMemory();
  }

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

  const toneMatch = text.match(
    /\b(use|prefer)\s+(simple|friendly|formal|short|long)\s+(answers|response|responses)?/i
  );
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
    memory.facts = dedupeFacts(facts);
  }

  return saveMemory(memory);
}

export function buildMemoryPrompt() {
  if (!isLoggedIn()) return "";

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
    safeStorageRemove(getDataStorage(), scopedMemoryKey());
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
