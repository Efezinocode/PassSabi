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
  const chatSearch = document.getElementById("chatSearch");
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
  let searchQuery = "";

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
    const query = searchQuery.trim().toLowerCase();

    const visibleSessions = !query
      ? sessions
      : sessions.filter(function (session) {
          const title = String(session.title || "").toLowerCase();
          const messagesText = Array.isArray(session.messages)
            ? session.messages
                .map(function (msg) {
                  return String(msg.text || "");
                })
                .join(" ")
                .toLowerCase()
            : "";

          return title.includes(query) || messagesText.includes(query);
        });

    if (historyList) {
      historyList.innerHTML = "";
    }

    if (visibleSessions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = query ? "No chats found." : "No chats yet.";
      historyList.appendChild(empty);
      return;
    }

    renderHistory(historyList, visibleSessions, currentChatId, {
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
    onShare: handleShareAction,
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

  function sanitizeFileName(value) {
    return String(value || "PassSabi-Chat")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
  }

  function getExportBaseName(session) {
    const title = sanitizeFileName(session?.title || "PassSabi-Chat");
    const date = new Date().toISOString().slice(0, 10);
    return `PassSabi-${title}-${date}`;
  }

  function buildPlainTextExport(session) {
    const lines = [];
    const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

    lines.push("PassSabi AI Chat");
    lines.push(`Title: ${session?.title || "New Chat"}`);
    lines.push(`Created: ${createdAt.toLocaleString()}`);
    lines.push(`Pinned: ${session?.pinned ? "Yes" : "No"}`);
    lines.push("");
    lines.push("Conversation");
    lines.push("------------");
    lines.push("");

    (session?.messages || []).forEach(function (msg) {
      const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
      lines.push(`${speaker}:`);
      lines.push(String(msg.text || "").trim());
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  function buildMarkdownExport(session) {
    const lines = [];
    const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

    lines.push(`# PassSabi AI Chat`);
    lines.push("");
    lines.push(`**Title:** ${session?.title || "New Chat"}`);
    lines.push(`**Created:** ${createdAt.toLocaleString()}`);
    lines.push(`**Pinned:** ${session?.pinned ? "Yes" : "No"}`);
    lines.push("");
    lines.push(`## Conversation`);
    lines.push("");

    (session?.messages || []).forEach(function (msg) {
      const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
      lines.push(`### ${speaker}`);
      lines.push("");
      lines.push(String(msg.text || "").trim());
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "").trim();
    if (!value) return false;

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const temp = document.createElement("textarea");
    temp.value = value;
    temp.setAttribute("readonly", "");
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch {
      success = false;
    }

    document.body.removeChild(temp);
    return success;
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], {
      type: mimeType || "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function handleShareAction(action) {
    const session = getCurrentSession();
    if (!session) return;

    const baseName = getExportBaseName(session);
    const plainText = buildPlainTextExport(session);
    const markdown = buildMarkdownExport(session);

    if (action === "pin") {
      toggleCurrentChatPin();
      return;
    }

    if (action === "txt") {
      downloadTextFile(`${baseName}.txt`, plainText, "text/plain;charset=utf-8");
      return;
    }

    if (action === "md") {
      downloadTextFile(`${baseName}.md`, markdown, "text/markdown;charset=utf-8");
    }
  }

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
