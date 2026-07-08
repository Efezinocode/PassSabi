// js/ui.js
export function cleanReply(text) {
  return String(text || "").trim();
}

export function isNearBottom(container, threshold = 120) {
  if (!container) return true;

  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;

  return distanceFromBottom <= threshold;
}

export function scrollToBottom(container, smooth = false) {
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function autoScrollIfNeeded(container, threshold = 120, smooth = false) {
  if (isNearBottom(container, threshold)) {
    scrollToBottom(container, smooth);
  }
}

export function autoResizeInput(input) {
  if (!input) return;
  if (input.tagName !== "TEXTAREA") return;

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

export function setSendButtonState(sendBtn, isGenerating) {
  if (!sendBtn) return;

  if (isGenerating) {
    sendBtn.textContent = "■";
    sendBtn.setAttribute("aria-label", "Stop generating");
    sendBtn.title = "Stop generating";
  } else {
    sendBtn.textContent = "➤";
    sendBtn.setAttribute("aria-label", "Send message");
    sendBtn.title = "Send message";
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function renderInlineMarkdown(text) {
  let out = escapeHtml(text);

  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/^\s*-\s+(.*)$/gm, "<li>$1</li>");
  out = out.replace(/^\s*\d+\.\s+(.*)$/gm, "<li>$1</li>");
  out = linkify(out);

  return out;
}

function renderMarkdown(text) {
  const raw = cleanReply(text);
  if (!raw) return "";

  const codeBlocks = [];
  let safe = raw.replace(/```([\s\S]*?)```/g, function (_, code) {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(
      `<pre class="md-code"><code>${escapeHtml(code.trim())}</code></pre>`
    );
    return token;
  });

  const lines = safe.split(/\r?\n/);
  const html = [];
  let inUl = false;
  let inOl = false;
  let inPara = false;

  function closeLists() {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  }

  function closePara() {
    if (inPara) {
      html.push("</p>");
      inPara = false;
    }
  }

  for (let line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closePara();
      closeLists();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      closePara();
      closeLists();

      const level = Math.min(trimmed.match(/^#{1,6}/)[0].length, 6);
      const content = trimmed.replace(/^#{1,6}\s+/, "");
      html.push(`<h${level} class="md-h">${renderInlineMarkdown(content)}</h${level}>`);
      continue;
    }

    if (/^\-\s+/.test(trimmed)) {
      closePara();
      if (!inUl) {
        closeLists();
        html.push("<ul class=\"md-list\">");
        inUl = true;
      }
      html.push(`<li>${renderInlineMarkdown(trimmed.replace(/^\-\s+/, ""))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      closePara();
      if (!inOl) {
        closeLists();
        html.push("<ol class=\"md-list\">");
        inOl = true;
      }
      html.push(`<li>${renderInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeLists();
    if (!inPara) {
      html.push("<p class=\"md-p\">");
      inPara = true;
    } else {
      html.push("<br>");
    }
    html.push(renderInlineMarkdown(trimmed));
  }

  closePara();
  closeLists();

  let out = html.join("");

  codeBlocks.forEach((block, index) => {
    out = out.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return out;
}

export function appendMessage(chatBox, msg) {
  if (!chatBox || !msg) return null;

  const row = document.createElement("div");
  row.className = `chat-row ${msg.role === "assistant" ? "assistant" : "user"}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  if (msg.typing) {
    bubble.classList.add("typing");
    bubble.innerHTML =
      '<span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
  } else if (msg.role === "assistant") {
    bubble.classList.add("md-content");
    bubble.innerHTML = renderMarkdown(msg.text);
  } else {
    bubble.textContent = cleanReply(msg.text);
  }

  row.appendChild(bubble);
  chatBox.appendChild(row);

  return bubble;
}

export function createAssistantBubble(chatBox) {
  if (!chatBox) return null;

  const row = document.createElement("div");
  row.className = "chat-row assistant";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble md-content";

  row.appendChild(bubble);
  chatBox.appendChild(row);

  return bubble;
}

export function updateAssistantBubble(bubble, text) {
  if (!bubble) return;
  bubble.classList.add("md-content");
  bubble.innerHTML = renderMarkdown(text);
}

export function appendTypingIndicator(chatBox) {
  return appendMessage(chatBox, {
    role: "assistant",
    text: "",
    typing: true,
  });
}

export function removeTypingPlaceholders(chatBox) {
  if (!chatBox) return;

  chatBox
    .querySelectorAll(".chat-row.assistant .chat-bubble.typing")
    .forEach((ph) => {
      const row = ph.closest(".chat-row");
      if (row) row.remove();
    });
}

export function renderCurrentSession(chatBox, session) {
  if (!chatBox) return;

  chatBox.innerHTML = "";

  if (!session) return;

  session.messages.forEach((msg) => {
    appendMessage(chatBox, msg);
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
