// js/chat.js
import {
  createSession,
  loadSessions,
  saveSessions,
  loadCurrentChatId,
  saveCurrentChatId,
  makeSessionTitle,
  migrateLegacyMessages,
  removeLegacyMessagesKey,
  updateMemoryFromMessage,
  buildMemoryPrompt,
} from "./storage.js";

import { currentUser } from "./auth.js";
import { streamChatReply } from "./api.js";
import {
  appendMessage,
  appendTypingIndicator,
  autoResizeInput,
  autoScrollIfNeeded,
  cleanReply,
  createAssistantBubble,
  renderCurrentSession,
  renderHistory,
  removeTypingPlaceholders,
  scrollToBottom,
  setSendButtonState,
  setMessageActionHandlers,
  updateAssistantBubble,
  updateWelcomeState,
} from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const CHAT_INPUT_SELECTORS = [
  "#chatInput",
  "#messageInput",
  "textarea[name='message']",
  "textarea[data-chat-input]",
].join(",");

const SEND_BUTTON_SELECTORS = [
  "#sendBtn",
  "#sendButton",
  "button[type='submit']",
].join(",");

const NEW_CHAT_SELECTORS = [
  "#newChatBtn",
  "[data-action='new-chat']",
].join(",");

const SEARCH_SELECTORS = [
  "#chatSearch",
  "#historySearch",
  "[data-chat-search]",
].join(",");

const sidebarState = {
  open: false,
};

const chatState = {
  sessions: [],
  currentChatId: "",
  activeController: null,
  activePartialText: "",
  typingVisible: false,
  rendering: false,
  lastAssistantBubble: null,
  lastUserMessageText: "",
};

function now() {
  return Date.now();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isGuest() {
  return !currentUser();
}

function getSessions() {
  return chatState.sessions;
}

function setSessions(next) {
  chatState.sessions = Array.isArray(next) ? next : [];
  return chatState.sessions;
}

function getCurrentSession() {
  const currentId = chatState.currentChatId || loadCurrentChatId();
  return (
    chatState.sessions.find((session) => session.id === currentId) ||
    chatState.sessions[0] ||
    null
  );
}

function setCurrentSessionId(sessionId) {
  chatState.currentChatId = String(sessionId || "").trim();
  saveCurrentChatId(chatState.currentChatId);
}

function persistSessions() {
  saveSessions(chatState.sessions);
}

function ensureSession() {
  let session = getCurrentSession();
  if (!session) {
    session = createSession("New Chat");
    chatState.sessions.unshift(session);
    chatState.currentChatId = session.id;
    persistSessions();
    saveCurrentChatId(session.id);
  }
  return session;
}

function updateSession(sessionId, updater) {
  const index = chatState.sessions.findIndex((session) => session.id === sessionId);
  if (index === -1) return null;

  const next = { ...chatState.sessions[index] };
  updater(next);
  next.updatedAt = now();
  chatState.sessions[index] = next;
  persistSessions();
  return next;
}

function addMessageToSession(sessionId, message) {
  return updateSession(sessionId, (session) => {
    session.messages = Array.isArray(session.messages) ? session.messages : [];
    session.messages.push({
      role: message.role === "assistant" ? "assistant" : "user",
      text: String(message.text || ""),
      ts: typeof message.ts === "number" ? message.ts : now(),
    });
  });
}

function setSessionTitle(sessionId, title) {
  return updateSession(sessionId, (session) => {
    session.title = title || "New Chat";
  });
}

function pinSession(sessionId, pinned) {
  return updateSession(sessionId, (session) => {
    session.pinned = !!pinned;
  });
}

function deleteSession(sessionId) {
  const next = chatState.sessions.filter((session) => session.id !== sessionId);
  chatState.sessions = next;
  if (chatState.currentChatId === sessionId) {
    chatState.currentChatId = next[0]?.id || "";
    saveCurrentChatId(chatState.currentChatId);
  }
  persistSessions();
  renderHistory(chatState.sessions, chatState.currentChatId);
  renderCurrentSession(getCurrentSession());
  updateWelcomeState(chatState.sessions);
}

function selectSession(sessionId) {
  const session = chatState.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  chatState.currentChatId = session.id;
  saveCurrentChatId(session.id);
  renderCurrentSession(session);
  renderHistory(chatState.sessions, chatState.currentChatId);
  updateWelcomeState(chatState.sessions);
  scrollToBottom();
}

function createNewChat(title = "New Chat") {
  const session = createSession(title);
  chatState.sessions.unshift(session);
  setCurrentSessionId(session.id);
  persistSessions();
  renderHistory(chatState.sessions, chatState.currentChatId);
  renderCurrentSession(session);
  updateWelcomeState(chatState.sessions);
  scrollToBottom();
  return session;
}

function getChatInput() {
  return $(CHAT_INPUT_SELECTORS);
}

function getSendButton() {
  return $(SEND_BUTTON_SELECTORS);
}

function getSearchInput() {
  return $(SEARCH_SELECTORS);
}

function setInputValue(value) {
  const input = getChatInput();
  if (!input) return;
  input.value = value;
  autoResizeInput(input);
}

function clearInput() {
  setInputValue("");
}

function readInputValue() {
  return String(getChatInput()?.value || "").trim();
}

function getVisibleMessageText(text) {
  return String(text || "").trim();
}

function buildModelPrompt(userText) {
  const basePrompt = [
    "You are PassSabi AI, a friendly personal AI teacher for students in Nigeria.",
    "Teach clearly, step by step, and keep answers simple and practical.",
    "Use examples when helpful.",
    "If the student asks for WAEC, NECO, JAMB, GCE, or NABTEB help, answer in an exam-friendly way.",
    "Avoid long unnecessary explanations unless the question needs them.",
  ].join(" ");

  const memoryPrompt = buildMemoryPrompt();
  const extra = [];
  if (memoryPrompt) extra.push(memoryPrompt);
  if (userText) extra.push(`Student message: ${userText}`);

  return [basePrompt, ...extra].join("\n\n");
}

export function buildStudyModePrompt(message) {
  const text = String(message || "").toLowerCase();

  const wantsExam = /do an exam|practice exam|mock exam|exam me|test me|set an exam/.test(text);
  if (wantsExam) {
    return {
      visibleText: "Practice exam",
      promptText:
        "Create a full practice exam for the topic in this chat. " +
        "Write exactly 30 objective questions numbered 1 to 30. " +
        "Each question must have 4 options (A, B, C, D). " +
        "After each question, show the correct answer clearly. " +
        "After the objective section, add a theory section with 5 theory questions. " +
        "Keep the language simple and student-friendly.",
    };
  }

  const wantsQuiz = /quiz me|give me a quiz|quiz/.test(text);
  if (wantsQuiz) {
    return {
      visibleText: "Quiz me",
      promptText:
        "Create a short quiz on the topic in this chat with only 3 to 5 questions. " +
        "Make the questions clear and easy to answer.",
    };
  }

  return null;
}

export function buildLessonPrompt(action, answerText) {
  const session = getCurrentSession();
  const lastUser = [...(session?.messages || [])].reverse().find((msg) => msg.role === "user");
  const topic = lastUser?.text || answerText || session?.title || "this topic";

  if (action === "explain") {
    return {
      visibleText: "Explain again",
      promptText:
        `Explain this topic in simpler words for a student.\n\n` +
        `Use short sentences, step by step, and keep it easy to understand.\n\nTopic: ${topic}`,
    };
  }

  if (action === "example") {
    return {
      visibleText: "Give example",
      promptText:
        `Give one or two simple real-life examples for this topic and explain them clearly.\n\nTopic: ${topic}`,
    };
  }

  if (action === "quiz") {
    return {
      visibleText: "Quiz me",
      promptText:
        `Create a short quiz on this topic with only 3 to 5 questions.\n\nTopic: ${topic}`,
    };
  }

  return null;
}

function removeTyping() {
  removeTypingPlaceholders();
  chatState.typingVisible = false;
}

function showTyping() {
  if (chatState.typingVisible) return;
  appendTypingIndicator();
  chatState.typingVisible = true;
  scrollToBottom();
}

function updateActiveAssistantBubble(text) {
  const safe = String(text || "");
  chatState.activePartialText = safe;
  if (!chatState.lastAssistantBubble) {
    chatState.lastAssistantBubble = createAssistantBubble();
  }
  updateAssistantBubble(chatState.lastAssistantBubble, safe);
  autoScrollIfNeeded();
}

function finalizeAssistantBubble(text) {
  const safe = cleanReply(String(text || ""));
  updateActiveAssistantBubble(safe);
  return safe;
}

async function startGeneration(options = {}) {
  const {
    appendUserMessage = true,
    clearInput: shouldClearInput = false,
    visibleText = "",
    promptText = "",
    autoTitle = true,
  } = options;

  const inputText = visibleText || promptText || readInputValue();
  const finalVisibleText = getVisibleMessageText(inputText);
  const finalPromptText = String(promptText || visibleText || inputText || "").trim();

  if (!finalPromptText) return;

  const session = ensureSession();
  const userText = finalVisibleText || finalPromptText;

  if (appendUserMessage) {
    addMessageToSession(session.id, {
      role: "user",
      text: userText,
      ts: now(),
    });
    chatState.lastUserMessageText = userText;
  }

  if (autoTitle && session.title === "New Chat") {
    const title = makeSessionTitle(userText);
    setSessionTitle(session.id, title);
  }

  renderHistory(chatState.sessions, chatState.currentChatId);
  renderCurrentSession(getCurrentSession());
  updateWelcomeState(chatState.sessions);

  if (shouldClearInput) clearInput();

  setSendButtonState(false);
  showTyping();
  chatState.lastAssistantBubble = null;
  chatState.activePartialText = "";

  if (chatState.activeController) {
    try {
      chatState.activeController.abort();
    } catch {
      // ignore
    }
  }

  const controller = new AbortController();
  chatState.activeController = controller;

  const promptWithMemory = buildModelPrompt(finalPromptText);

  try {
    let streamText = "";

    await streamChatReply({
      message: promptWithMemory,
      signal: controller.signal,
      onChunk: (chunkText) => {
        streamText = String(chunkText || "");
        removeTyping();
        updateActiveAssistantBubble(streamText);
      },
      onDone: () => {
        removeTyping();
      },
    });

    const finalText = finalizeAssistantBubble(streamText);

    addMessageToSession(session.id, {
      role: "assistant",
      text: finalText,
      ts: now(),
    });

    updateMemoryFromMessage(finalVisibleText || finalPromptText);

    persistSessions();
    renderHistory(chatState.sessions, chatState.currentChatId);
    renderCurrentSession(getCurrentSession());
    updateWelcomeState(chatState.sessions);
    scrollToBottom();
  } catch (error) {
    removeTyping();

    const message =
      error?.name === "AbortError"
        ? "Request stopped."
        : error?.message || "Something went wrong.";

    updateActiveAssistantBubble(message);

    addMessageToSession(session.id, {
      role: "assistant",
      text: message,
      ts: now(),
    });

    persistSessions();
    renderHistory(chatState.sessions, chatState.currentChatId);
    renderCurrentSession(getCurrentSession());
    updateWelcomeState(chatState.sessions);
    scrollToBottom();
  } finally {
    chatState.activeController = null;
    setSendButtonState(true);
  }
}

function handleSendClick() {
  const value = readInputValue();
  if (!value) return;
  startGeneration({
    appendUserMessage: true,
    clearInput: true,
    visibleText: value,
    promptText: value,
    autoTitle: true,
  });
}

function handleEnterToSend(event) {
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;
  event.preventDefault();
  handleSendClick();
}

function bindChatInput() {
  const input = getChatInput();
  const sendBtn = getSendButton();

  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      autoResizeInput(input);
      setSendButtonState(!!String(input.value || "").trim());
    });
    input.addEventListener("keydown", handleEnterToSend);
    autoResizeInput(input);
  }

  if (sendBtn && sendBtn.dataset.bound !== "true") {
    sendBtn.dataset.bound = "true";
    sendBtn.addEventListener("click", handleSendClick);
  }
}

function bindNewChatButtons() {
  $$(NEW_CHAT_SELECTORS).forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      createNewChat();
    });
  });
}

function bindSearch() {
  const search = getSearchInput();
  if (!search || search.dataset.bound === "true") return;

  search.dataset.bound = "true";
  search.addEventListener("input", () => {
    const query = String(search.value || "").trim().toLowerCase();
    if (!query) {
      renderHistory(chatState.sessions, chatState.currentChatId);
      return;
    }

    const filtered = chatState.sessions.filter((session) => {
      const haystack = [
        session.title,
        ...(session.messages || []).map((msg) => msg.text),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    renderHistory(filtered, chatState.currentChatId);
  });
}

function bindHistoryActions() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-chat-id], [data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const chatId = target.getAttribute("data-chat-id");

    if (chatId && !action) {
      selectSession(chatId);
      return;
    }

    if (!chatId || !action) return;

    if (action === "open-chat") {
      selectSession(chatId);
      return;
    }

    if (action === "delete-chat") {
      deleteSession(chatId);
      return;
    }

    if (action === "pin-chat") {
      const session = chatState.sessions.find((item) => item.id === chatId);
      pinSession(chatId, !session?.pinned);
      renderHistory(chatState.sessions, chatState.currentChatId);
      return;
    }

    if (action === "rename-chat") {
      const nextTitle = prompt("Rename chat", "");
      if (!nextTitle) return;
      setSessionTitle(chatId, nextTitle.trim());
      renderHistory(chatState.sessions, chatState.currentChatId);
      renderCurrentSession(getCurrentSession());
    }
  });
}

function bindLessonToolButtons() {
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-lesson-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-lesson-action");
    const contextText = btn.getAttribute("data-context") || "";

    const lesson = buildLessonPrompt(action, contextText);
    if (!lesson) return;

    await startGeneration({
      appendUserMessage: true,
      clearInput: false,
      visibleText: lesson.visibleText,
      promptText: lesson.promptText,
      autoTitle: false,
    });
  });
}

function bootstrapExistingSession() {
  const sessions = loadSessions();
  if (!sessions.length) {
    const legacyMigrated = migrateLegacyMessages();
    if (legacyMigrated) {
      removeLegacyMessagesKey();
    }
  }

  const loadedSessions = loadSessions();
  setSessions(loadedSessions);

  const savedCurrent = loadCurrentChatId();
  chatState.currentChatId = savedCurrent || loadedSessions[0]?.id || "";
  if (!chatState.currentChatId && loadedSessions[0]) {
    chatState.currentChatId = loadedSessions[0].id;
    saveCurrentChatId(chatState.currentChatId);
  }

  if (!chatState.sessions.length) {
    const created = createNewChat();
    chatState.currentChatId = created.id;
  }
}

function bindGlobalAuthRefresh() {
  window.addEventListener("passsabi:auth-changed", () => {
    bootstrapExistingSession();
    renderHistory(chatState.sessions, chatState.currentChatId);
    renderCurrentSession(getCurrentSession());
    updateWelcomeState(chatState.sessions);
  });
}

function handleVisibilityRefresh() {
  window.addEventListener("pageshow", () => {
    renderHistory(chatState.sessions, chatState.currentChatId);
    renderCurrentSession(getCurrentSession());
    updateWelcomeState(chatState.sessions);
  });
}

function initChatApp() {
  bootstrapExistingSession();
  bindChatInput();
  bindNewChatButtons();
  bindSearch();
  bindHistoryActions();
  bindLessonToolButtons();
  bindGlobalAuthRefresh();
  handleVisibilityRefresh();

  renderHistory(chatState.sessions, chatState.currentChatId);
  renderCurrentSession(getCurrentSession());
  updateWelcomeState(chatState.sessions);
  setSendButtonState(!!readInputValue());

  const input = getChatInput();
  if (input) {
    autoResizeInput(input);
  }
  scrollToBottom();
}

document.addEventListener("DOMContentLoaded", initChatApp);

window.PassSabiChat = {
  startGeneration,
  createNewChat,
  selectSession,
  deleteSession,
  pinSession,
  buildStudyModePrompt,
  buildLessonPrompt,
};
