// script.js - PassSabi AI chat, non-streaming, sidebar, chat history

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

  const STORAGE_KEY = "passsabi_chat_sessions_v1";
  const CURRENT_CHAT_KEY = "passsabi_current_chat_id_v1";
  const LEGACY_MESSAGES_KEY = "passsabi_messages_v1";

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
    } else {
      sessions.push(createSession("New Chat"));
    }
    currentChatId = sessions[0].id;
    saveSessions();
    saveCurrentChatId();
  } else if (!currentChatId || !sessions.some((session) => session.id === currentChatId)) {
    currentChatId = sessions[0].id;
    saveCurrentChatId();
  }

  renderCurrentSession();
  renderHistory();
  updateWelcomeState();
  input.focus();

  if (menuBtn && sidebar && backdrop) {
    menuBtn.addEventListener("click", toggleSidebar);
    backdrop.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      startNewChat();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage();
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = input.value.trim();
    if (message === "") return;

    const session = getCurrentSession();
    if (!session) return;

    const userMsg = {
      role: "user",
      text: message,
      ts: Date.now(),
    };

    session.messages.push(userMsg);

    if (session.title === "New Chat") {
      session.title = makeSessionTitle(message);
    }

    session.updatedAt = Date.now();
    saveSessions();
    appendMessage(userMsg);
    renderHistory();
    updateWelcomeState();

    input.value = "";
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    appendTypingIndicator();
    scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const raw = await response.text();

      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || data.details || raw || `HTTP ${response.status}`);
      }

      removeTypingPlaceholders();

      const assistantMsg = {
        role: "assistant",
        text: cleanReply(data.reply || "No response."),
        ts: Date.now(),
      };

      session.messages.push(assistantMsg);
      session.updatedAt = Date.now();
      saveSessions();
      appendMessage(assistantMsg);
      renderHistory();
      updateWelcomeState();
    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders();

      const errMsg = {
        role: "assistant",
        text: err.message || "Sorry, something went wrong. Please try again.",
        ts: Date.now(),
      };

      appendMessage(errMsg);
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
      scrollToBottom();
    }
  }

  function appendMessage(msg) {
    const row = document.createElement("div");
    row.className = `chat-row ${msg.role}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    if (msg.typing) {
      bubble.classList.add("typing");
      bubble.innerHTML =
        '<span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
    } else {
      bubble.textContent = cleanReply(msg.text);
    }

    row.appendChild(bubble);
    chatBox.appendChild(row);
  }

  function appendTypingIndicator() {
    appendMessage({ role: "assistant", text: "", typing: true, ts: Date.now() });
  }

  function removeTypingPlaceholders() {
    chatBox
      .querySelectorAll(".chat-row.assistant .chat-bubble.typing")
      .forEach((ph) => {
        const row = ph.closest(".chat-row");
        if (row) row.remove();
      });
  }

  function renderCurrentSession() {
    const session = getCurrentSession();
    chatBox.innerHTML = "";

    if (!session) {
      updateWelcomeState();
      return;
    }

    session.messages.forEach((msg) => appendMessage(msg));
    scrollToBottom();
  }

  function renderHistory() {
    if (!historyList) return;

    historyList.innerHTML = "";

    const ordered = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

    if (ordered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "No chats yet.";
      historyList.appendChild(empty);
      return;
    }

    ordered.forEach((session) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `history-item ${session.id === currentChatId ? "active" : ""}`;
      item.textContent = session.title || "New Chat";

      item.addEventListener("click", function () {
        switchSession(session.id);
      });

      historyList.appendChild(item);
    });
  }

  function switchSession(sessionId) {
    currentChatId = sessionId;
    saveCurrentChatId();
    renderCurrentSession();
    renderHistory();
    updateWelcomeState();
    closeSidebar();
    input.focus();
  }

  function startNewChat() {
    const newSession = createSession("New Chat");
    sessions.unshift(newSession);
    currentChatId = newSession.id;

    saveCurrentChatId();
    saveSessions();

    renderCurrentSession();
    renderHistory();
    updateWelcomeState();
    closeSidebar();
    input.focus();
  }

  function getCurrentSession() {
    return sessions.find((session) => session.id === currentChatId) || null;
  }

  function createSession(title) {
    return {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function makeSessionTitle(message) {
    const clean = String(message || "").replace(/\s+/g, " ").trim();
    if (!clean) return "New Chat";
    return clean.length > 28 ? `${clean.slice(0, 28).trim()}…` : clean;
  }

  function migrateLegacyMessages() {
    try {
      const raw = localStorage.getItem(LEGACY_MESSAGES_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      const firstUser = parsed.find((m) => m && m.role === "user" && typeof m.text === "string");
      const title = firstUser ? makeSessionTitle(firstUser.text) : "Imported Chat";

      return {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        messages: parsed.filter((m) => m && typeof m.text === "string"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((session) => session && session.id && Array.isArray(session.messages));
    } catch {
      return [];
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn("Could not save chat sessions", e);
    }
  }

  function loadCurrentChatId() {
    try {
      return localStorage.getItem(CURRENT_CHAT_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveCurrentChatId() {
    try {
      localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
    } catch (e) {
      console.warn("Could not save current chat id", e);
    }
  }

  function updateWelcomeState() {
    const session = getCurrentSession();
    const hasMessages = !!(session && session.messages.length > 0);

    if (welcomeScreen) {
      welcomeScreen.hidden = hasMessages;
    }

    document.body.classList.toggle("has-messages", hasMessages);
  }

  function scrollToBottom() {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth",
    });
  }

  function openSidebar() {
    if (!sidebar || !backdrop || !menuBtn) return;
    sidebar.classList.add("open");
    backdrop.classList.add("show");
    sidebar.setAttribute("aria-hidden", "false");
    menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    if (!sidebar || !backdrop || !menuBtn) return;
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    sidebar.setAttribute("aria-hidden", "true");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (!sidebar) return;
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function cleanReply(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[*-]\s+/gm, "• ")
      .trim();
  }
});
