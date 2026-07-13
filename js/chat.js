import {
  createSession,
  loadSessions,
  loadCurrentChatId,
  saveSessions,
  saveCurrentChatId,
  migrateLegacyMessages,
  removeLegacyMessagesKey,
  makeSessionTitle,
  loadMemory,
  buildMemoryPrompt,
  updateMemoryFromMessage,
  isLoggedIn,          // ← Added
} from "./storage.js";

import { bindSidebarEvents, closeSidebar } from "./sidebar.js";

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

import { streamChatReply } from "./api.js";

document.addEventListener("DOMContentLoaded", function () {
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chat-box");
  const form = document.getElementById("chat-form");

  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const newChatBtn = document.getElementById("newChatBtn");
  const chatSearch = document.getElementById("chatSearch");
  const historyList = document.getElementById("chat-history");
  const welcomeScreen = document.getElementById("welcome-screen");

  const DEFAULT_PLACEHOLDER = "Type your question here...";

  if (!chatBox || !input || !form) return;

  // === GUEST / LOGGED-IN LOGIC ===
  const userIsLoggedIn = isLoggedIn();

  let sessions = userIsLoggedIn ? loadSessions() : [];
  let currentChatId = userIsLoggedIn ? loadCurrentChatId() : "";

  let searchQuery = "";
  let isGenerating = false;
  let activeController = null;
  let activeAssistantBubble = null;
  let activePartialText = "";
  
  function canUseMemory() {
    const isUserPage = window.location.pathname.includes("user-chat");
    return isUserPage && userIsLoggedIn;
  }

  if (!Array.isArray(sessions)) sessions = [];

  if (sessions.length === 0) {
    const migrated = migrateLegacyMessages();
    if (migrated && userIsLoggedIn) {
      sessions.push(migrated);
      removeLegacyMessagesKey();
    } else {
      sessions.push(createSession("New Chat"));
    }
    currentChatId = sessions[0].id;
    if (userIsLoggedIn) {
      saveSessions(sessions);
      saveCurrentChatId(currentChatId);
    }
  } else if (
    !currentChatId ||
    !sessions.some(function (session) {
      return session.id === currentChatId;
    })
  ) {
    currentChatId = sessions[0].id;
    if (userIsLoggedIn) saveCurrentChatId(currentChatId);
  }

  function getCurrentSession() {
    return (
      sessions.find(function (session) {
        return session.id === currentChatId;
      }) || null
    );
  }

  function clearTransientStatus() {
    chatBox.querySelectorAll(".transient-status").forEach((node) => node.remove());
  }

  function syncCurrentSessionRender() {
    renderCurrentSession(chatBox, getCurrentSession());
    updateWelcomeState(welcomeScreen, getCurrentSession());
    scrollToBottom(chatBox, false);
  }

  function refreshHistory() {
    if (!historyList) return;

    if (!userIsLoggedIn) {
      historyList.innerHTML = `<p style="padding: 12px 16px; color: #94a3b8; font-size: 0.9rem; text-align: center;">Sign in to save your chats across sessions</p>`;
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    const visibleSessions = !query
      ? sessions
      : sessions.filter(function (session) {
          const title = String(session.title || "").toLowerCase();
          const messagesText = Array.isArray(session.messages)
            ? session.messages
                .map((msg) => String(msg.text || ""))
                .join(" ")
                .toLowerCase()
            : "";
          return title.includes(query) || messagesText.includes(query);
        });

    renderHistory(historyList, visibleSessions, currentChatId, {
      onSwitch: switchSession,
      onDelete: deleteSession,
      onPin: toggleCurrentChatPin,
      onRename: renameSession,
    });
  }

  function renderAll() {
    syncCurrentSessionRender();
    refreshHistory();
  }

  function setGeneratingState(nextState) {
    isGenerating = nextState;
    input.disabled = nextState;
    input.placeholder = nextState ? "PassSabi is thinking..." : DEFAULT_PLACEHOLDER;
    setSendButtonState(sendBtn, nextState);
  }

  function stopGenerating() {
    if (!isGenerating || !activeController) return;
    activeController.abort();
  }

  function ensureSessionExists() {
    if (sessions.length === 0) {
      const fresh = createSession("New Chat");
      sessions = [fresh];
      currentChatId = fresh.id;
      if (userIsLoggedIn) {
        saveSessions(sessions);
        saveCurrentChatId(currentChatId);
      }
    }
  }

  // === All your existing functions remain unchanged from here ===
  // (buildPlainTextExport, buildMarkdownExport, handleShareAction, etc.)

  function buildPlainTextExport(session) { /* ... your original code ... */ }
  function buildMarkdownExport(session) { /* ... */ }
  async function copyTextToClipboard(text) { /* ... */ }
  function downloadTextFile(filename, content, mimeType) { /* ... */ }
  async function handleShareAction(action) { /* ... */ }
  function buildStudyModePrompt(message) { /* ... */ }
  function buildLessonPrompt(action, answerText) { /* ... */ }
  async function handleLessonToolAction(action, context = {}) { /* ... */ }
  function renameSession(sessionId = currentChatId) { /* ... */ }
  function retryLastResponse() { /* ... */ }
  function toggleCurrentChatPin(sessionId = currentChatId) { /* ... */ }
  function switchSession(sessionId) { /* ... */ }
  function startNewChat() { /* ... */ }
  function deleteSession(sessionId) { /* ... */ }

  async function startGeneration(message, options = {}) {
    // ... your original startGeneration function ...
    // Just make sure to wrap saveSessions calls with: if (userIsLoggedIn) { saveSessions... }
    const session = getCurrentSession();
    if (!session || isGenerating) return;

    // ... rest of your original code ...

    if (appendUserMessage) {
      // ... 
      session.updatedAt = Date.now();
      if (userIsLoggedIn) saveSessions(sessions);   // ← Protected
      // ...
    }

    // In the try block after assistant response:
    session.messages.push(assistantMsg);
    session.updatedAt = Date.now();
    if (userIsLoggedIn) saveSessions(sessions);     // ← Protected

    // Same in catch block for partial response
  }

  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    const studyPrompt = buildStudyModePrompt(message);
    startGeneration(message, {
      appendUserMessage: true,
      clearInput: true,
      visibleText: message,
      promptText: studyPrompt ? studyPrompt.promptText : message,
      autoTitle: true,
    });
  }

  ensureSessionExists();
  renderAll();
  autoResizeInput(input);
  setSendButtonState(sendBtn, false);

  setMessageActionHandlers({
    onShare: handleShareAction,
    onLessonTool: handleLessonToolAction,
    onRetry: retryLastResponse,
  });

  bindSidebarEvents({
    menuBtn,
    sidebar,
    backdrop,
    newChatBtn,
    onNewChat: startNewChat,
  });

  if (chatSearch) {
    chatSearch.addEventListener("input", function () {
      searchQuery = chatSearch.value || "";
      refreshHistory();
    });

    chatSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        chatSearch.value = "";
        searchQuery = "";
        refreshHistory();
        chatSearch.blur();
      }
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopPropagation();

    if (isGenerating) {
      stopGenerating();
      return;
    }

    sendMessage();
  });

  input.addEventListener("input", function () {
    autoResizeInput(input);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      if (input.tagName === "TEXTAREA") {
        event.preventDefault();
        if (!isGenerating) sendMessage();
      }
    }
  });
});
