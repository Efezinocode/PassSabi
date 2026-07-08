import { appendMessage } from "./uiMessages.js";

export function renderCurrentSession(chatBox, session) {
  if (!chatBox) return;

  chatBox.innerHTML = "";

  if (!session) return;

  session.messages.forEach((msg) => {
    appendMessage(chatBox, msg, {
      showShare: true,
      showLessonTools: msg.role === "assistant" && !msg.typing,
      pinned: Boolean(session.pinned),
    });
  });
}

export function renderHistory(historyList, sessions, currentChatId, handlers = {}) {
  if (!historyList) return;

  historyList.innerHTML = "";

  const ordered = Array.isArray(sessions)
    ? sessions.slice().sort((a, b) => {
        const pinnedA = a?.pinned ? 1 : 0;
        const pinnedB = b?.pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;
        return (b?.updatedAt || 0) - (a?.updatedAt || 0);
      })
    : [];

  if (ordered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No chats yet.";
    historyList.appendChild(empty);
    return;
  }

  ordered.forEach((session) => {
    const row = document.createElement("div");
    row.className = "history-item-row";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = `history-item-main ${
      session.id === currentChatId ? "active" : ""
    }`;
    mainBtn.textContent = session.title || "New Chat";

    mainBtn.addEventListener("click", () => {
      if (typeof handlers.onSwitch === "function") {
        handlers.onSwitch(session.id);
      }
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "history-rename-btn";
    renameBtn.innerHTML = "✎";
    renameBtn.title = "Rename chat";
    renameBtn.setAttribute("aria-label", `Rename ${session.title || "chat"}`);

    renameBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onRename === "function") {
        handlers.onRename(session.id);
      }
    });

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = `history-pin-btn ${session.pinned ? "pinned" : ""}`;
    pinBtn.textContent = session.pinned ? "📌" : "📍";
    pinBtn.title = session.pinned ? "Unpin chat" : "Pin chat";
    pinBtn.setAttribute("aria-label", session.pinned ? "Unpin chat" : "Pin chat");

    pinBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onPin === "function") {
        handlers.onPin(session.id);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-delete-btn";
    deleteBtn.setAttribute("aria-label", `Delete ${session.title || "chat"}`);
    deleteBtn.title = "Delete this chat";
    deleteBtn.textContent = "🗑";

    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onDelete === "function") {
        handlers.onDelete(session.id);
      }
    });

    row.appendChild(mainBtn);
    row.appendChild(renameBtn);
    row.appendChild(pinBtn);
    row.appendChild(deleteBtn);
    historyList.appendChild(row);
  });
}

export function updateWelcomeState(welcomeScreen, session) {
  const hasMessages = !!(
    session &&
    Array.isArray(session.messages) &&
    session.messages.length > 0
  );

  if (welcomeScreen) {
    welcomeScreen.hidden = hasMessages;
  }

  document.body.classList.toggle("has-messages", hasMessages);
                  }
