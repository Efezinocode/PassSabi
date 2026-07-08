// js/chat.js
import {
  createSession,
  loadSessions,
  loadCurrentChatId,
  saveSessions,
  saveCurrentChatId,
  migrateLegacyMessages,
  removeLegacyMessagesKey,
  makeSessionTitle,
} from "./storage.js";

import {
  bindSidebarEvents,
  closeSidebar,
} from "./sidebar.js";

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
  const btn = document.getElementById("btn");
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chat-box");
  const form = document.getElementById("chat-form");

  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const newChatBtn = document.getElementById("newChatBtn");
  const historyList = document.getElementById("chat-history");
  const welcomeScreen = document.getElementById("welcome-screen");

  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "chat.html";
    });
  }

  if (!chatBox || !input || !form) return;

  let sessions = loadSessions();
  let currentChatId = loadCurrentChatId();

  if (sessions.length === 0) {
    const migrated = migrateLegacyMessages();

    if (migrated) {
      sessions.push(migrated);
      removeLegacyMessagesKey();
    } else {
      sessions.push(createSession("New Chat"));
    }

    currentChatId = sessions[0].id;
    saveSessions(sessions);
    saveCurrentChatId(currentChatId);
  } else if (
    !currentChatId ||
    !sessions.some(function (session) {
      return session.id === currentChatId;
    })
  ) {
    currentChatId = sessions[0].id;
    saveCurrentChatId(currentChatId);
  }

  let isGenerating = false;
  let activeController = null;
  let activeAssistantBubble = null;
  let activePartialText = "";

  function getCurrentSession() {
    return (
      sessions.find(function (session) {
        return session.id === currentChatId;
      }) || null
    );
  }

  function syncCurrentSessionRender() {
    renderCurrentSession(chatBox, getCurrentSession());
    updateWelcomeState(welcomeScreen, getCurrentSession());
    scrollToBottom(chatBox, false);
  }

  function refreshHistory() {
    renderHistory(historyList, sessions, currentChatId, {
      onSwitch: switchSession,
      onDelete: deleteSession,
      onPin: toggleCurrentChatPin,
    });
  }

  function setGeneratingState(nextState) {
    isGenerating = nextState;
    input.disabled = nextState;
    setSendButtonState(sendBtn, nextState);
  }

  function stopGenerating() {
    if (!isGenerating || !activeController) return;
    activeController.abort();
  }

  function renderAll() {
    syncCurrentSessionRender();
    refreshHistory();
  }

  function ensureSessionExists() {
    if (sessions.length === 0) {
      const fresh = createSession("New Chat");
      sessions = [fresh];
      currentChatId = fresh.id;
      saveSessions(sessions);
      saveCurrentChatId(currentChatId);
    }
  }

  ensureSessionExists();
  renderAll();
  autoResizeInput(input);

  setMessageActionHandlers({
    onRegenerate: regenerateLatestResponse,
    onPin: toggleCurrentChatPin,
  });

  bindSidebarEvents({
    menuBtn,
    sidebar,
    backdrop,
    newChatBtn,
    onNewChat: startNewChat,
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

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

  async function startGeneration(message, options = {}) {
    const {
      appendUserMessage = true,
      clearInput = false,
    } = options;

    const session = getCurrentSession();
    if (!session) return;

    if (isGenerating) return;

    const prompt = String(message || "").trim();
    if (!prompt) return;

    if (appendUserMessage) {
      const userMsg = {
        role: "user",
        text: prompt,
        ts: Date.now(),
      };

      session.messages.push(userMsg);

      if (session.title === "New Chat") {
        session.title = makeSessionTitle(prompt);
      }

      session.updatedAt = Date.now();
      saveSessions(sessions);

      appendMessage(chatBox, userMsg);
      refreshHistory();
      updateWelcomeState(welcomeScreen, session);

      if (clearInput) {
        input.value = "";
        autoResizeInput(input);
      }

      input.blur();
    }

    appendTypingIndicator(chatBox);
    scrollToBottom(chatBox, false);

    const controller = new AbortController();
    activeController = controller;
    activeAssistantBubble = null;
    activePartialText = "";

    setGeneratingState(true);

    const timeoutId = setTimeout(function () {
      controller.abort();
    }, 90000);

    try {
      const finalText = await streamChatReply({
        message: prompt,
        signal: controller.signal,
        onChunk: function (_chunk, fullText) {
          activePartialText = fullText;

          if (!activeAssistantBubble) {
            removeTypingPlaceholders(chatBox);
            activeAssistantBubble = createAssistantBubble(chatBox);
          }

          updateAssistantBubble(activeAssistantBubble, fullText);
          autoScrollIfNeeded(chatBox, 80, false);
        },
        onDone: function (provider) {
          console.log("Answered by:", provider);
        },
      });

      removeTypingPlaceholders(chatBox);

      const cleanText = cleanReply(finalText || activePartialText || "No response.");
      if (!cleanText) {
        throw new Error("No response text found.");
      }

      const assistantMsg = {
        role: "assistant",
        text: cleanText,
        ts: Date.now(),
      };

      session.messages.push(assistantMsg);
      session.updatedAt = Date.now();
      saveSessions(sessions);

      renderAll();
      scrollToBottom(chatBox, false);
    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders(chatBox);

      const partial = cleanReply(activePartialText || "");

      if (partial) {
        const assistantMsg = {
          role: "assistant",
          text: partial,
          ts: Date.now(),
        };

        session.messages.push(assistantMsg);
        session.updatedAt = Date.now();
        saveSessions(sessions);

        renderAll();
        scrollToBottom(chatBox, false);
      } else if (err.name !== "AbortError") {
        appendMessage(chatBox, {
          role: "assistant",
          text: err.message || "Sorry, something went wrong. Please try again.",
          ts: Date.now(),
        });
      }
    } finally {
      clearTimeout(timeoutId);
      activeController = null;
      activeAssistantBubble = null;
      activePartialText = "";
      setGeneratingState(false);
      input.blur();
      autoResizeInput(input);
      scrollToBottom(chatBox, false);
    }
  }

  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;
    startGeneration(message, { appendUserMessage: true, clearInput: true });
  }

  function regenerateLatestResponse() {
    if (isGenerating) return;

    const session = getCurrentSession();
    if (!session || session.messages.length < 2) return;

    const lastMessage = session.messages[session.messages.length - 1];
    const previousMessage = session.messages[session.messages.length - 2];

    if (lastMessage.role !== "assistant" || previousMessage.role !== "user") {
      return;
    }

    session.messages.pop();
    session.updatedAt = Date.now();
    saveSessions(sessions);

    renderAll();
    scrollToBottom(chatBox, false);

    startGeneration(previousMessage.text, {
      appendUserMessage: false,
      clearInput: false,
    });
  }

  function toggleCurrentChatPin(sessionId = currentChatId) {
    const session = sessions.find(function (item) {
      return item.id === sessionId;
    });

    if (!session) return;

    session.pinned = !session.pinned;
    session.updatedAt = Date.now();

    saveSessions(sessions);
    refreshHistory();
    renderAll();
  }

  function switchSession(sessionId) {
    if (isGenerating) stopGenerating();

    currentChatId = sessionId;
    saveCurrentChatId(currentChatId);
    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function startNewChat() {
    if (isGenerating) stopGenerating();

    const current = getCurrentSession();
    if (current && current.messages.length === 0) {
      closeSidebar(sidebar, backdrop, menuBtn);
      input.blur();
      return;
    }

    const newSession = createSession("New Chat");
    sessions.unshift(newSession);
    currentChatId = newSession.id;

    saveCurrentChatId(currentChatId);
    saveSessions(sessions);

    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function deleteSession(sessionId) {
    if (isGenerating && sessionId === currentChatId) {
      stopGenerating();
    }

    const session = sessions.find(function (item) {
      return item.id === sessionId;
    });
    if (!session) return;

    const label = session.title || "this chat";
    if (!confirm(`Delete "${label}"?`)) return;

    const deletingCurrent = sessionId === currentChatId;
    sessions = sessions.filter(function (item) {
      return item.id !== sessionId;
    });

    if (sessions.length === 0) {
      const fresh = createSession("New Chat");
      sessions = [fresh];
      currentChatId = fresh.id;
    } else {
      sessions.sort(function (a, b) {
        const pinnedA = a.pinned ? 1 : 0;
        const pinnedB = b.pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;
        return b.updatedAt - a.updatedAt;
      });

      if (
        deletingCurrent ||
        !sessions.some(function (item) {
          return item.id === currentChatId;
        })
      ) {
        currentChatId = sessions[0].id;
      }
    }

    saveCurrentChatId(currentChatId);
    saveSessions(sessions);

    renderAll();
    input.blur();
  }
});
