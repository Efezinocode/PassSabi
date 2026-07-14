const STORAGE_KEY = "passsabi_chat_sessions_v1";
const CURRENT_CHAT_KEY = "passsabi_current_chat_id_v1";
const LEGACY_MESSAGES_KEY = "passsabi_messages_v1";
const MEMORY_KEY = "passsabi_memory_v1";

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

// ==================== NEW: LOGIN CHECK ====================
export function isLoggedIn() {
  return !!(
    localStorage.getItem("passsabi_session_v1") || 
    sessionStorage.getItem("passsabi_session_v1")
  );
}
// ========================================================

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
    messages: safeMessages,
    createdAt:
      typeof session?.createdAt === "number" ? session.createdAt : Date.now(),
    updatedAt:
      typeof session?.updatedAt === "number" ? session.updatedAt : Date.now(),
    pinned: Boolean(session?.pinned),
  };
}

export function createSession(title = "New Chat") {
  return normalizeSession({
    id: makeId("chat"),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  });
}

// Updated: Guests get empty sessions
export function loadSessions() {
  if (!isLoggedIn()) return [];

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

// Updated: Only save when logged in
export function saveSessions(sessions) {
  if (!isLoggedIn()) return;   // ← Guests never save

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

// Updated
export function loadCurrentChatId() {
  if (!isLoggedIn()) return "";
  try {
    return localStorage.getItem(CURRENT_CHAT_KEY) || "";
  } catch {
    return "";
  }
}

export function saveCurrentChatId(chatId) {
  if (!isLoggedIn()) return;
  try {
    localStorage.setItem(CURRENT_CHAT_KEY, chatId || "");
  } catch (error) {
    console.warn("Could not save current chat id", error);
  }
}

export function makeSessionTitle(message) {
  const clean = cleanText(message);
  if (!clean) return "New Chat";
  return clean.length > 28 ? `${clean.slice(0, 28).trim()}…` : clean;
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
      id: makeId("chat"),
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

function createEmptyMemory() {
  return {
    profile: {
      name: "",
      examType: "",
      favoriteSubject: "",
      school: "",
      classLevel: "",
    },
    preferences: {
      tone: "friendly",
      language: "simple",
      answerLength: "medium",
    },
    facts: [],
    lastUpdated: Date.now(),
  };
}

function normalizeFact(fact) {
  if (!fact || typeof fact !== "object") return null;

  const key = cleanText(fact.key);
  const value = cleanText(fact.value);
  if (!key || !value) return null;

  return {
    id: typeof fact.id === "string" && fact.id.trim() ? fact.id.trim() : makeId("fact"),
    key,
    label: cleanText(fact.label) || key,
    value: capText(value, 120),
    source: cleanText(fact.source) || "chat",
    updatedAt: typeof fact.updatedAt === "number" ? fact.updatedAt : Date.now(),
  };
}

function normalizeMemory(memory) {
  const base = createEmptyMemory();
  if (!memory || typeof memory !== "object") return base;

  const profile =
    memory.profile && typeof memory.profile === "object" ? memory.profile : {};
  base.profile.name = capText(profile.name, 60);
  base.profile.examType = cleanText(profile.examType).toUpperCase();
  base.profile.favoriteSubject = capText(profile.favoriteSubject, 60);
  base.profile.school = capText(profile.school, 80);
  base.profile.classLevel = cleanText(profile.classLevel).toUpperCase();

  const preferences =
    memory.preferences && typeof memory.preferences === "object"
      ? memory.preferences
      : {};
  base.preferences.tone = cleanText(preferences.tone) || base.preferences.tone;
  base.preferences.language =
    cleanText(preferences.language) || base.preferences.language;
  base.preferences.answerLength =
    cleanText(preferences.answerLength) || base.preferences.answerLength;

  base.facts = Array.isArray(memory.facts)
    ? memory.facts.map(normalizeFact).filter(Boolean).slice(-25)
    : [];

  base.lastUpdated =
    typeof memory.lastUpdated === "number" ? memory.lastUpdated : Date.now();

  return base;
}

export function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return createEmptyMemory();
    return normalizeMemory(safeJsonParse(raw, null));
  } catch {
    return createEmptyMemory();
  }
}

export function saveMemory(memory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(normalizeMemory(memory)));
  } catch (error) {
    console.warn("Could not save memory", error);
  }
}

function upsertFact(memory, key, value, label, source = "chat") {
  const nextValue = capText(value, 120);
  if (!nextValue) return;

  const nextFact = normalizeFact({
    key,
    value: nextValue,
    label,
    source,
    updatedAt: Date.now(),
  });

  if (!nextFact) return;

  memory.facts = (memory.facts || []).filter((fact) => fact?.key !== nextFact.key);
  memory.facts.push(nextFact);
  memory.facts = memory.facts.slice(-25);
}

function extractMemoryHints(message) {
  const text = cleanText(message);
  if (!text) return {};

  const hints = {};

  const nameMatch = text.match(
    /\b(?:my name is|call me)\s+([A-Za-z][A-Za-z' -]{1,40})\b/i
  );
  if (nameMatch) {
    const name = cleanText(nameMatch[1]).replace(
      /\b(?:student|boy|girl|man|woman)\b/gi,
      ""
    );
    if (name && !/^\d+$/.test(name)) hints.name = name;
  }

  const examMatch = text.match(/\b(waec|neco|jamb|gce|nabteb)\b/i);
  if (examMatch) hints.examType = examMatch[1].toUpperCase();

  const subjectMatch = text.match(
    /\b(?:my favorite subject is|my favourite subject is|my best subject is)\s+([A-Za-z][A-Za-z0-9 &/.-]{1,40})/i
  );
  if (subjectMatch) {
    const subject = cleanText(subjectMatch[1]);
    if (subject) hints.favoriteSubject = subject;
  }

  const classMatch = text.match(
    /\b(?:i am in|i'm in|my class is)\s+(jss\s?[123]|ss\s?[123]|primary\s?[1-6]|year\s?[1-6])\b/i
  );
  if (classMatch) {
    hints.classLevel = cleanText(classMatch[1]).replace(/\s+/g, "").toUpperCase();
  }

  const schoolMatch = text.match(/\b(?:my school is|i go to)\s+(.{2,60}?)(?:[.!?]|$)/i);
  if (schoolMatch) hints.school = cleanText(schoolMatch[1]);

  const preferenceMatch = text.match(
    /\b(?:please answer|speak)\s+(simply|briefly|shortly|clearly)\b/i
  );
  if (preferenceMatch) hints.answerLength = preferenceMatch[1].toLowerCase();

  return hints;
}

export function updateMemoryFromMessage(message, source = "chat") {
  const next = loadMemory();
  const hints = extractMemoryHints(message);

  if (hints.name) {
    next.profile.name = hints.name;
    upsertFact(next, "name", hints.name, "Name", source);
  }

  if (hints.examType) {
    next.profile.examType = hints.examType;
    upsertFact(next, "examType", hints.examType, "Exam type", source);
  }

  if (hints.favoriteSubject) {
    next.profile.favoriteSubject = hints.favoriteSubject;
    upsertFact(next, "favoriteSubject", hints.favoriteSubject, "Favorite subject", source);
  }

  if (hints.classLevel) {
    next.profile.classLevel = hints.classLevel;
    upsertFact(next, "classLevel", hints.classLevel, "Class level", source);
  }

  if (hints.school) {
    next.profile.school = hints.school;
    upsertFact(next, "school", hints.school, "School", source);
  }

  if (hints.answerLength) {
    next.preferences.answerLength = hints.answerLength;
    upsertFact(next, "answerLength", hints.answerLength, "Answer length", source);
  }

  next.lastUpdated = Date.now();
  saveMemory(next);
  return next;
}

export function buildMemoryPrompt(memory = loadMemory()) {
  const safeMemory = normalizeMemory(memory);
  const lines = [];

  if (safeMemory.profile.name) lines.push(`- Name: ${safeMemory.profile.name}`);
  if (safeMemory.profile.examType) lines.push(`- Exam type: ${safeMemory.profile.examType}`);
  if (safeMemory.profile.favoriteSubject) lines.push(`- Favorite subject: ${safeMemory.profile.favoriteSubject}`);
  if (safeMemory.profile.classLevel) lines.push(`- Class level: ${safeMemory.profile.classLevel}`);
  if (safeMemory.profile.school) lines.push(`- School: ${safeMemory.profile.school}`);

  if (safeMemory.preferences.tone) lines.push(`- Tone: ${safeMemory.preferences.tone}`);
  if (safeMemory.preferences.language) lines.push(`- Language: ${safeMemory.preferences.language}`);
  if (safeMemory.preferences.answerLength) lines.push(`- Answer length: ${safeMemory.preferences.answerLength}`);

  const recentFacts = Array.isArray(safeMemory.facts) ? safeMemory.facts.slice(-8) : [];
  if (recentFacts.length) {
    lines.push("- Remembered facts:");
    recentFacts.forEach((fact) => {
      lines.push(`  - ${fact.label}: ${fact.value}`);
    });
  }

  return lines.length ? `Known user memory:\n${lines.join("\n")}` : "";
}

export function clearMemory() {
  try {
    localStorage.removeItem(MEMORY_KEY);
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
  };
}
