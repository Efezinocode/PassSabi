// js/chatSession.js

export function createChatSessionController({
  state,
  chatBox,
  historyList,
  welcomeScreen,
  input,
  sidebar,
  backdrop,
  menuBtn,
  saveSessions,
  saveCurrentChatId,
  createSession,
  renderCurrentSession,
  renderHistory,
  updateWelcomeState,
  scrollToBottom,
  closeSidebar,
}) {
  let beforeSessionChange = null;

  function setBeforeSessionChange(callback) {
    beforeSessionChange = typeof callback === "function" ? callback : null;
  }

  function getCurrentSession() {
    return (
      state.sessions.find(function (session) {
        return session.id === state.currentChatId;
      }) || null
    );
  }

  function setSearchQuery(query) {
    state.searchQuery = String(query || "");
    refreshHistory();
  }

  function syncCurrentSessionRender() {
    renderCurrentSession(chatBox, getCurrentSession());
    updateWelcomeState(welcomeScreen, getCurrentSession());
    scrollToBottom(chatBox, false);
  }

  function refreshHistory() {
    const query = String(state.searchQuery || "").trim().toLowerCase();

    const visibleSessions = !query
      ? state.sessions
      : state.sessions.filter(function (session) {
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

    renderHistory(historyList, visibleSessions, state.currentChatId, {
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

  function ensureSessionExists() {
    if (state.sessions.length === 0) {
      const fresh = createSession("New Chat");
      state.sessions = [fresh];
      state.currentChatId = fresh.id;
      saveSessions(state.sessions);
      saveCurrentChatId(state.currentChatId);
    }
  }

  function switchSession(sessionId) {
    if (beforeSessionChange) beforeSessionChange();

    state.currentChatId = sessionId;
    saveCurrentChatId(state.currentChatId);
    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function startNewChat() {
    if (beforeSessionChange) beforeSessionChange();

    const current = getCurrentSession();
    if (current && current.messages.length === 0) {
      closeSidebar(sidebar, backdrop, menuBtn);
      input.blur();
      return;
    }

    const newSession = createSession("New Chat");
    state.sessions.unshift(newSession);
    state.currentChatId = newSession.id;

    saveCurrentChatId(state.currentChatId);
    saveSessions(state.sessions);

    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function deleteSession(sessionId) {
    if (beforeSessionChange) beforeSessionChange();

    const session = state.sessions.find(function (item) {
      return item.id === sessionId;
    });
    if (!session) return;

    const label = session.title || "this chat";
    if (!confirm(`Delete "${label}"?`)) return;

    const deletingCurrent = sessionId === state.currentChatId;
    state.sessions = state.sessions.filter(function (item) {
      return item.id !== sessionId;
    });

    if (state.sessions.length === 0) {
      const fresh = createSession("New Chat");
      state.sessions = [fresh];
      state.currentChatId = fresh.id;
    } else {
      state.sessions.sort(function (a, b) {
        const pinnedA = a.pinned ? 1 : 0;
        const pinnedB = b.pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;
        return b.updatedAt - a.updatedAt;
      });

      if (
        deletingCurrent ||
        !state.sessions.some(function (item) {
          return item.id === state.currentChatId;
        })
      ) {
        state.currentChatId = state.sessions[0].id;
      }
    }

    saveCurrentChatId(state.currentChatId);
    saveSessions(state.sessions);

    renderAll();
    input.blur();
  }

  function toggleCurrentChatPin(sessionId = state.currentChatId) {
    const session = state.sessions.find(function (item) {
      return item.id === sessionId;
    });

    if (!session) return;

    session.pinned = !session.pinned;
    session.updatedAt = Date.now();

    saveSessions(state.sessions);
    refreshHistory();
    syncCurrentSessionRender();
  }

  function renameSession(sessionId = state.currentChatId) {
    const session = state.sessions.find(function (item) {
      return item.id === sessionId;
    });

    if (!session) return;

    const nextTitle = window.prompt("Rename chat", session.title || "New Chat");
    if (nextTitle === null) return;

    const cleanTitle = String(nextTitle).trim();
    if (!cleanTitle) return;

    session.title = cleanTitle;
    session.updatedAt = Date.now();

    saveSessions(state.sessions);
    refreshHistory();
    syncCurrentSessionRender();
  }

  return {
    setBeforeSessionChange,
    getCurrentSession,
    setSearchQuery,
    refreshHistory,
    renderAll,
    ensureSessionExists,
    switchSession,
    startNewChat,
    deleteSession,
    toggleCurrentChatPin,
    renameSession,
  };
        }
