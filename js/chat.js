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

import { currentUser, syncAuthState } from "./auth.js";
import { streamChatReply } from "./api.js";
import {
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
  appendTypingIndicator,
} from "./ui.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const CHAT_INPUT_SELECTORS = [
  "#chatInput",
  "#userInput",
  "#messageInput",
  "textarea[name='message']",
  "textarea[data-chat-input]",
].join(",");

const SEND_BUTTON_SELECTORS = ["#sendBtn", "#sendButton", "button[type='submit']"].join(",");
const NEW_CHAT_SELECTORS = ["#newChatBtn", "[data-action='new-chat']"].join(",");
const SEARCH_SELECTORS = ["#chatSearch", "#historySearch", "[data-chat-search]"].join(",");

const chatState = {
  sessions: [],
  currentChatId: "",
  activeController: null,
  typingVisible: false,
  lastAssistantBubble: null,
};

const now = () => Date.now();

function isLoggedIn() {
  return !!currentUser();
}

function getChatBox() {
  return $("#chat-box");
}
function getWelcomeScreen() {
  return $("#welcome-screen");
}
function getHistoryList() {
  return $("#chat-history");
}
function getChatForm() {
  return $("#chat-form");
}
function getMenuButton() {
  return $("#menuBtn");
}
function getSidebar() {
  return $("#sidebar");
}
function getBackdrop() {
  return $("#backdrop");
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

function goBackSafely() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.replace("index.html");
  }
}

function wireBackButtons() {
  document.querySelectorAll("[data-back-button]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goBackSafely();
    });
  });
}

function openSidebarPanel() {
  const sidebar = getSidebar();
  const backdrop = getBackdrop();
  const menuBtn = getMenuButton();

  if (sidebar) sidebar.classList.add("open");
  if (backdrop) backdrop.classList.add("show");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-open");
}

function closeSidebarPanel() {
  const sidebar = getSidebar();
  const backdrop = getBackdrop();
  const menuBtn = getMenuButton();

  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-open");
}

function persistSessions() {
  if (!isLoggedIn()) return;
  saveSessions(chatState.sessions);
}

function currentSession() {
  const id = chatState.currentChatId || loadCurrentChatId();
  return chatState.sessions.find((s) => s.id === id) || chatState.sessions[0] || null;
}

function refreshAll() {
  renderHistory(
    getHistoryList(),
    isLoggedIn() ? chatState.sessions : [],
    chatState.currentChatId,
    historyHandlers()
  );
  renderCurrentSession(getChatBox(), currentSession());
  updateWelcomeState(getWelcomeScreen(), currentSession());
}

function setCurrentSessionId(id) {
  chatState.currentChatId = String(id || "");
  if (isLoggedIn()) {
    saveCurrentChatId(chatState.currentChatId);
  }
}

function ensureSession() {
  let session = currentSession();
  if (!session) {
    session = createSession("New Chat");
    chatState.sessions.unshift(session);
    setCurrentSessionId(session.id);
    persistSessions();
  }
  return session;
}

function historyHandlers() {
  return {
    onSwitch: (id) => {
      selectSession(id);
      closeSidebarPanel();
    },
    onPin: (id) => {
      if (!isLoggedIn()) return;
      const s = chatState.sessions.find((x) => x.id === id);
      if (!s) return;
      s.pinned = !s.pinned;
      s.updatedAt = now();
      persistSessions();
      refreshAll();
    },
    onRename: (id) => {
      if (!isLoggedIn()) return;
      const title = prompt("Rename chat", "");
      if (!title) return;
      const s = chatState.sessions.find((x) => x.id === id);
      if (!s) return;
      s.title = title.trim() || s.title;
      s.updatedAt = now();
      persistSessions();
      refreshAll();
    },
    onDelete: (id) => {
      if (!isLoggedIn()) return;
      chatState.sessions = chatState.sessions.filter((s) => s.id !== id);
      if (chatState.currentChatId === id) {
        chatState.currentChatId = chatState.sessions[0]?.id || "";
        saveCurrentChatId(chatState.currentChatId);
      }
      persistSessions();
      refreshAll();
      closeSidebarPanel();
    },
  };
}

function selectSession(id) {
  const s = chatState.sessions.find((x) => x.id === id);
  if (!s) return;
  setCurrentSessionId(s.id);
  renderCurrentSession(getChatBox(), s);
  renderHistory(
    getHistoryList(),
    isLoggedIn() ? chatState.sessions : [],
    chatState.currentChatId,
    historyHandlers()
  );
  updateWelcomeState(getWelcomeScreen(), s);
  scrollToBottom(getChatBox());
}

function createNewChat(title = "New Chat") {
  const s = createSession(title);
  chatState.sessions.unshift(s);
  setCurrentSessionId(s.id);
  persistSessions();
  refreshAll();
  scrollToBottom(getChatBox());
  return s;
}

function loadData() {
  if (!isLoggedIn()) {
    chatState.sessions = [createSession("New Chat")];
    chatState.currentChatId = chatState.sessions[0]?.id || "";
    return;
  }

  const saved = loadSessions();
  if (!saved.length) {
    if (migrateLegacyMessages()) removeLegacyMessagesKey();
  }

  chatState.sessions = loadSessions();
  chatState.currentChatId = loadCurrentChatId() || chatState.sessions[0]?.id || "";

  if (!chatState.currentChatId && chatState.sessions[0]) {
    chatState.currentChatId = chatState.sessions[0].id;
    saveCurrentChatId(chatState.currentChatId);
  }

  if (!chatState.sessions.length) createNewChat();
}

function bindSidebarShell() {
  const menuBtn = getMenuButton();
  const backdrop = getBackdrop();
  const newChatBtn = $("#newChatBtn");

  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      const sidebar = getSidebar();
      if (!sidebar) return;
      if (sidebar.classList.contains("open")) closeSidebarPanel();
      else openSidebarPanel();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeSidebarPanel);
  }

  if (newChatBtn && newChatBtn.dataset.bound !== "true") {
    newChatBtn.dataset.bound = "true";
    newChatBtn.addEventListener("click", (e) => {
      e.preventDefault();
      createNewChat();
      closeSidebarPanel();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebarPanel();
  });
}

function bindNewChatButtons() {
  $$(NEW_CHAT_SELECTORS).forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      createNewChat();
      closeSidebarPanel();
    });
  });
}

function setInputValue(v) {
  const input = getChatInput();
  if (!input) return;
  input.value = v;
  autoResizeInput(input);
}

function readInputValue() {
  return String(getChatInput()?.value || "").trim();
}

function showTyping() {
  if (chatState.typingVisible) return;
  appendTypingIndicator(getChatBox());
  chatState.typingVisible = true;
  scrollToBottom(getChatBox());
}

function hideTyping() {
  removeTypingPlaceholders(getChatBox());
  chatState.typingVisible = false;
}

function updateAssistant(text) {
  if (!chatState.lastAssistantBubble) {
    chatState.lastAssistantBubble = createAssistantBubble(getChatBox());
  }
  updateAssistantBubble(chatState.lastAssistantBubble, String(text || ""));
  autoScrollIfNeeded(getChatBox());
}

function buildModelPrompt(userText) {
  const parts = [
    "You are PassSabi AI, a friendly personal AI teacher for students in Nigeria.",
    "Teach clearly, step by step, and keep answers simple.",
  ];

  if (isLoggedIn()) {
    const mem = buildMemoryPrompt();
    if (mem) parts.push(mem);
  }

  if (userText) parts.push(`Student message: ${userText}`);
  return parts.join("\n\n");
}

export function buildStudyModePrompt(message) {
  const text = String(message || "").toLowerCase();
  if (/do an exam|practice exam|mock exam|exam me|test me|set an exam/.test(text)) {
    return {
      visibleText: "Practice exam",
      promptText:
        "Create a full practice exam for the topic in this chat. Write exactly 30 objective questions numbered 1 to 30. Each question must have 4 options (A, B, C, D). After each question, show the correct answer clearly. After the objective section, add 5 theory questions. Keep the language simple.",
    };
  }
  if (/quiz me|give me a quiz|quiz/.test(text)) {
    return {
      visibleText: "Quiz me",
      promptText: "Create a short quiz on the topic in this chat with only 3 to 5 questions.",
    };
  }
  return null;
}

export function buildLessonPrompt(action, answerText) {
  const lastUser = [...(currentSession()?.messages || [])]
    .reverse()
    .find((m) => m.role === "user");
  const topic = lastUser?.text || answerText || currentSession()?.title || "this topic";

  if (action === "explain") {
    return {
      visibleText: "Explain again",
      promptText: `Explain this topic in simpler words.\n\nTopic: ${topic}`,
    };
  }
  if (action === "example") {
    return {
      visibleText: "Give example",
      promptText: `Give one or two simple examples for this topic.\n\nTopic: ${topic}`,
    };
  }
  if (action === "quiz") {
    return {
      visibleText: "Quiz me",
      promptText: `Create a short quiz with 3 to 5 questions.\n\nTopic: ${topic}`,
    };
  }
  return null;
}

async function startGeneration({
  visibleText = "",
  promptText = "",
  appendUserMessage = true,
  clearInput = false,
  autoTitle = true,
} = {}) {
  const finalText = String(promptText || visibleText || readInputValue()).trim();
  if (!finalText) return;

  const session = ensureSession();

  if (appendUserMessage) {
    session.messages = session.messages || [];
    session.messages.push({ role: "user", text: finalText, ts: now() });
  }

  if (autoTitle && session.title === "New Chat") {
    session.title = makeSessionTitle(finalText);
  }

  session.updatedAt = now();
  persistSessions();
  refreshAll();

  if (clearInput) setInputValue("");
  chatState.lastAssistantBubble = null;
  showTyping();

  if (chatState.activeController) chatState.activeController.abort();
  const controller = new AbortController();
  chatState.activeController = controller;

  try {
    let full = "";
    await streamChatReply({
      message: buildModelPrompt(finalText),
      signal: controller.signal,
      onChunk: (chunk) => {
        if (typeof chunk === "object" && chunk !== null) {
          full =
            chunk.text ||
            chunk.reply ||
            chunk.message ||
            chunk.content ||
            chunk.choices?.[0]?.message?.content ||
            "";
        } else {
          full = String(chunk || "");
        }
        hideTyping();
        updateAssistant(full);
      },
    });

    const answer = cleanReply(full);
    hideTyping();
    updateAssistant(answer);

    session.messages.push({ role: "assistant", text: answer, ts: now() });

    if (isLoggedIn()) {
      updateMemoryFromMessage(finalText);
    }

    session.updatedAt = now();
    persistSessions();
    refreshAll();
    scrollToBottom(getChatBox());
  } catch (e) {
    hideTyping();
    console.error("PassSabi AI generation failed:", e);

    const msg =
      e?.name === "AbortError"
        ? "Request stopped."
        : "PassSabi AI is temporarily unavailable. Please try again in a moment.";

    updateAssistant(msg);
    session.messages.push({ role: "assistant", text: msg, ts: now(), error: true });
    session.updatedAt = now();
    persistSessions();
    refreshAll();
  } finally {
    chatState.activeController = null;
    setSendButtonState(getSendButton(), false);
  }
}

function handleSend(e) {
  if (e) e.preventDefault();
  const value = readInputValue();
  if (!value) return;
  startGeneration({
    visibleText: value,
    promptText: value,
    appendUserMessage: true,
    clearInput: true,
    autoTitle: true,
  });
  closeSidebarPanel();
}

function bindChatInput() {
  const input = getChatInput();
  const form = getChatForm();
  const sendBtn = getSendButton();

  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => autoResizeInput(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    autoResizeInput(input);
  }

  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", handleSend);
  }

  if (sendBtn && sendBtn.dataset.bound !== "true") {
    sendBtn.dataset.bound = "true";
    sendBtn.addEventListener("click", handleSend);
  }
}

function bindSearch() {
  const search = getSearchInput();
  if (!search || search.dataset.bound === "true") return;

  search.dataset.bound = "true";
  search.addEventListener("input", () => {
    const q = String(search.value || "").trim().toLowerCase();
    if (!q) return refreshAll();

    const filtered = chatState.sessions.filter((s) =>
      [s.title, ...(s.messages || []).map((m) => m.text)].join(" ").toLowerCase().includes(q)
    );
    renderHistory(getHistoryList(), filtered, chatState.currentChatId, historyHandlers());
  });
}

function bindHistoryClicks() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-chat-id],[data-action]");
    if (!el) return;

    const id = el.getAttribute("data-chat-id");
    const action = el.getAttribute("data-action");

    if (id && !action) return selectSession(id);
    if (!id || !action) return;

    if (action === "open-chat") selectSession(id);
    if (action === "delete-chat") historyHandlers().onDelete(id);
    if (action === "pin-chat") historyHandlers().onPin(id);
    if (action === "rename-chat") historyHandlers().onRename(id);
  });
}

function bindLessonButtons() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-lesson-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-lesson-action");
    const lesson = buildLessonPrompt(action, btn.getAttribute("data-context") || "");
    if (!lesson) return;
    await startGeneration({
      visibleText: lesson.visibleText,
      promptText: lesson.promptText,
      appendUserMessage: true,
      clearInput: false,
      autoTitle: false,
    });
  });
}

function initChatApp() {
  loadData();
  wireBackButtons();
  bindSidebarShell();
  bindNewChatButtons();
  bindChatInput();
  bindSearch();
  bindHistoryClicks();
  bindLessonButtons();

  setMessageActionHandlers({
    onRetry: () => {
      const lastUser = [...(currentSession()?.messages || [])]
        .reverse()
        .find((m) => m.role === "user");
      if (!lastUser?.text) return;
      startGeneration({
        visibleText: lastUser.text,
        promptText: lastUser.text,
        appendUserMessage: false,
        clearInput: false,
        autoTitle: false,
      });
    },
    onLessonTool: (action, context = {}) => {
      const lesson = buildLessonPrompt(action, context.answerText || "");
      if (!lesson) return;
      startGeneration({
        visibleText: lesson.visibleText,
        promptText: lesson.promptText,
        appendUserMessage: true,
        clearInput: false,
        autoTitle: false,
      });
    },
    onShare: async (action) => {
      const session = currentSession();
      const lastAssistant = [...(session?.messages || [])]
        .reverse()
        .find((m) => m.role === "assistant");
      const text = lastAssistant?.text || "";

      if (action === "pin") {
        if (!session) return;
        session.pinned = !session.pinned;
        persistSessions();
        refreshAll();
        return;
      }

      if (!text) return;

      const title = session?.title || "PassSabi AI";

      if (action === "native-share" && navigator.share) {
        try {
          await navigator.share({ title, text });
        } catch {}
        return;
      }

      const blob = new Blob(
        [action === "md" ? `# ${title}\n\n${text}` : text],
        { type: "text/plain;charset=utf-8" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = action === "md" ? "passsabi-chat.md" : "passsabi-chat.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });

    window.addEventListener("passsabi:auth-changed", async () => {
    await syncAuthState().catch(() => {});
    loadData();
    refreshAll();
  });

  window.addEventListener("pageshow", async () => {
    await syncAuthState().catch(() => {});
    loadData();
    refreshAll();
  });
  

  const input = getChatInput();
  if (input) autoResizeInput(input);
  scrollToBottom(getChatBox());
}

document.addEventListener("DOMContentLoaded", initChatApp);

window.PassSabiChat = {
  startGeneration,
  createNewChat,
  selectSession,
  buildStudyModePrompt,
  buildLessonPrompt,
};
