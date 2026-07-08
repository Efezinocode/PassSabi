// js/script.js
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

  function updateKeyboardOffset() {
    if (!window.visualViewport) return;

    const offset = Math.max(
      0,
      window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
    );

    document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
  }

  updateKeyboardOffset();

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateKeyboardOffset);
    window.visualViewport.addEventListener("scroll", updateKeyboardOffset);
  }

  window.addEventListener("resize", updateKeyboardOffset);

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
      try {
        localStorage.removeItem(LEGACY_MESSAGES_KEY);
      } catch (e) {
        console.warn("Could not remove legacy messages", e);
      }
    } else {
      sessions.push(createSession("New Chat"));
    }
    currentChatId = sessions[0].id;
    saveSessions();
    saveCurrentChatId();
  } else if (!currentChatId || !sessions.some(function (session) {
    return session.id === currentChatId;
  })) {
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
    if (!message) return;

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

    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
      controller.abort();
    }, 90000);

    let fullReply = "";
    let assistantBubble = null;
    let firstChunkSeen = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch {
          errorText = "";
        }
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Missing streaming response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const result = await reader.read();
        const done = result.done;
        const value = result.value;

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary === -1) break;

          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const data = extractSseData(block);
          if (!data) continue;
          if (data === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            console.warn("Streaming parse error:", e);
            continue;
          }

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.chunk) {
            if (!firstChunkSeen) {
              firstChunkSeen = true;
              removeTypingPlaceholders();
              assistantBubble = createAssistantBubble();
            }

            fullReply += parsed.chunk;
            updateAssistantBubble(assistantBubble, fullReply);
            scrollToBottom();
          }

          if (parsed.done && parsed.provider) {
            console.log("Answered by: " + parsed.provider);
          }
        }

        if (done) break;
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const data = extractSseData(buffer);
        if (data && data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.chunk) {
              if (!firstChunkSeen) {
                firstChunkSeen = true;
                removeTypingPlaceholders();
                assistantBubble = createAssistantBubble();
              }
              fullReply += parsed.chunk;
              updateAssistantBubble(assistantBubble, fullReply);
            }
          } catch (e) {
            console.warn("Final buffer parse error:", e);
          }
        }
      }

      removeTypingPlaceholders();

      const finalText = cleanReply(fullReply || "No response.");
      if (!finalText) {
        throw new Error("No response text found.");
      }

      const assistantMsg = {
        role: "assistant",
        text: finalText,
        ts: Date.now(),
      };

      session.messages.push(assistantMsg);
      session.updatedAt = Date.now();
      saveSessions();

      if (!assistantBubble) {
        assistantBubble = createAssistantBubble();
      }
      updateAssistantBubble(assistantBubble, finalText);

      renderHistory();
      updateWelcomeState();
    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders();

      const partial = cleanReply(fullReply || "");
      if (partial) {
        const assistantMsg = {
          role: "assistant",
          text: partial,
          ts: Date.now(),
        };
        session.messages.push(assistantMsg);
        session.updatedAt = Date.now();
        saveSessions();

        if (!assistantBubble) {
          assistantBubble = createAssistantBubble();
        }
        updateAssistantBubble(assistantBubble, partial);

        renderHistory();
        updateWelcomeState();
      } else {
        const errMsg = {
          role: "assistant",
          text: err.message || "Sorry, something went wrong. Please try again.",
          ts: Date.now(),
        };
        appendMessage(errMsg);
      }
    } finally {
      clearTimeout(timeoutId);
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
      scrollToBottom();
    }
  }

  function appendMessage(msg) {
    const row = document.createElement("div");
    row.className = "chat-row " + msg.role;

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

  function createAssistantBubble() {
    const row = document.createElement("div");
    row.className = "chat-row assistant";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    row.appendChild(bubble);
    chatBox.appendChild(row);

    return bubble;
  }

  function updateAssistantBubble(bubble, text) {
    if (!bubble) return;
    bubble.textContent = cleanReply(text);
  }

  function appendTypingIndicator() {
    appendMessage({ role: "assistant", text: "", typing: true, ts: Date.now() });
  }

  function removeTypingPlaceholders() {
    chatBox
      .querySelectorAll(".chat-row.assistant .chat-bubble.typing")
      .forEach(function (ph) {
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

    session.messages.forEach(function (msg) {
      appendMessage(msg);
    });
    scrollToBottom();
  }

  function renderHistory() {
    if (!historyList) return;

    historyList.innerHTML = "";

    const ordered = sessions.slice().sort(function (a, b) {
      return b.updatedAt - a.updatedAt;
    });

    if (ordered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "No chats yet.";
      historyList.appendChild(empty);
      return;
    }

    ordered.forEach(function (session) {
      const row = document.createElement("div");
      row.className = "history-item-row";

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className =
        "history-item-main " + (session.id === currentChatId ? "active" : "");
      mainBtn.textContent = session.title || "New Chat";

      mainBtn.addEventListener("click", function () {
        switchSession(session.id);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "history-delete-btn";
      deleteBtn.setAttribute("aria-label", "Delete " + (session.title || "chat"));
      deleteBtn.title = "Delete this chat";
      deleteBtn.textContent = "🗑";

      deleteBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        deleteSession(session.id);
      });

      row.appendChild(mainBtn);
      row.appendChild(deleteBtn);
      historyList.appendChild(row);
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
    const current = getCurrentSession();
    if (current && current.messages.length === 0) {
      closeSidebar();
      input.focus();
      return;
    }

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

  function deleteSession(sessionId) {
    const session = sessions.find(function (item) {
      return item.id === sessionId;
    });
    if (!session) return;

    const label = session.title || "this chat";
    if (!confirm('Delete "' + label + '"?')) return;

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
        return b.updatedAt - a.updatedAt;
      });
      if (deletingCurrent || !sessions.some(function (item) { return item.id === currentChatId; })) {
        currentChatId = sessions[0].id;
      }
    }

    saveCurrentChatId();
    saveSessions();
    renderCurrentSession();
    renderHistory();
    updateWelcomeState();
    input.focus();
  }

  function getCurrentSession() {
    return sessions.find(function (session) {
      return session.id === currentChatId;
    }) || null;
  }

  function createSession(title) {
    return normalizeSession({
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
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

      const firstUser = parsed.find(function (m) {
        return m && m.role === "user" && typeof m.text === "string";
      });
      const title = firstUser ? makeSessionTitle(firstUser.text) : "Imported Chat";

      return normalizeSession({
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: title,
        messages: parsed.filter(function (m) {
          return m && typeof m.text === "string";
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch {
      return null;
    }
  }

  function normalizeSession(session) {
    const safeId =
      typeof session.id === "string" && session.id.trim()
        ? session.id
        : `chat_${Date.now()}`;
    const safeTitle =
      typeof session.title === "string" && session.title.trim()
        ? session.title.trim()
        : "New Chat";

    const safeMessages = Array.isArray(session.messages)
      ? session.messages
          .filter(function (message) {
            return message && typeof message.text === "string";
          })
          .map(function (message) {
            return {
              role: message.role === "assistant" ? "assistant" : "user",
              text: String(message.text),
              ts: typeof message.ts === "number" ? message.ts : Date.now(),
            };
          })
      : [];

    return {
      id: safeId,
      title: safeTitle,
      messages: safeMessages,
      createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
      updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
    };
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (session) {
          return session && session.id && Array.isArray(session.messages);
        })
        .map(function (session) {
          return normalizeSession(session);
        });
    } catch {
      return [];
    }
  }

  function saveSessions() {
    try {
      sessions.sort(function (a, b) {
        return b.updatedAt - a.updatedAt;
      });
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

  function extractSseData(block) {
    const lines = block.split(/\r?\n/);
    const dataLines = lines
      .filter(function (line) {
        return line.startsWith("data:");
      })
      .map(function (line) {
        return line.slice(5).replace(/^\s+/, "");
      });

    return dataLines.length ? dataLines.join("\n") : null;
  }

  function cleanReply(text) {
    return String(text || "").trim();
  }
});
