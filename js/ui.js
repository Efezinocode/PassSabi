mpinBtnopinBtBtntateeActionHandlerspinBtnopipinBtBtntateeActionHandlers = {
  onShare: null,
  onLessonTool: null,
  onRetry: null,
};

export function setMessageActionHandlers(handlers = {}) {
  messageActionHandlers = {
    ...messageActionHandlers,
    ...handlers,
  };
}

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
  out = linkify(out);
  return out;
}

function normalizeNumberedLines(text) {
  let current = 1;
  let insideNumberedList = false;

  return String(text || "")
    .split(/\r?\n/)
    .map(function (line) {
      const trimmed = line.trim();

      if (!trimmed) {
        insideNumberedList = false;
        current = 1;
        return line;
      }

      const match = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (!match) {
        insideNumberedList = false;
        return line;
      }

      if (!insideNumberedList) {
        current = 1;
        insideNumberedList = true;
      }

      return `${match[1]}${current++}. ${match[2]}`;
    })
    .join("\n");
}

function stowToken(stash, html) {
  const token = `__TOKEN_${stash.length}__`;
  stash.push({ token, html });
  return token;
}

function restoreTokens(text, stash) {
  let out = text;
  stash.forEach(function (item) {
    out = out.split(item.token).join(item.html);
  });
  return out;
}

function highlightCode(code, lang) {
  const lower = String(lang || "").toLowerCase();
  let out = escapeHtml(code.trimEnd());
  const stash = [];

  function protect(regex, cls) {
    out = out.replace(regex, function (match) {
      return stowToken(stash, `<span class="${cls}">${match}</span>`);
    });
  }

  if (["js", "javascript", "ts", "typescript", "jsx", "tsx"].includes(lower)) {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/\/\/[^\n]*/g, "token-comment");
    protect(
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g,
      "token-string"
    );

    out = out.replace(
      /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|try|catch|finally|throw|async|await|import|from|export|default|true|false|null|undefined|this|super|of|in|typeof|instanceof|void)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );

    out = out.replace(/\b\d+(\.\d+)?\b/g, function (match) {
      return stowToken(stash, `<span class="token-number">${match}</span>`);
    });
  } else if (["py", "python"].includes(lower)) {
    protect(/#[^\n]*/g, "token-comment");
    protect(
      /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      "token-string"
    );

    out = out.replace(
      /\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|lambda|pass|True|False|None|and|or|not|in|is)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );

    out = out.replace(/\b\d+(\.\d+)?\b/g, function (match) {
      return stowToken(stash, `<span class="token-number">${match}</span>`);
    });
  } else if (["json"].includes(lower)) {
    out = out.replace(
      /"(?:\\.|[^"\\])*"(?=\s*:)/g,
      function (match) {
        return stowToken(stash, `<span class="token-attr">${match}</span>`);
      }
    );

    out = out.replace(
      /"(?:\\.|[^"\\])*"|true|false|null|\b\d+(\.\d+)?\b/g,
      function (match) {
        if (match === "true" || match === "false" || match === "null") {
          return stowToken(stash, `<span class="token-boolean">${match}</span>`);
        }
        if (/^\d/.test(match)) {
          return stowToken(stash, `<span class="token-number">${match}</span>`);
        }
        return stowToken(stash, `<span class="token-string">${match}</span>`);
      }
    );
  } else if (["bash", "sh", "shell", "zsh"].includes(lower)) {
    protect(/#[^\n]*/g, "token-comment");
    protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "token-string");

    out = out.replace(
      /\b(?:cd|ls|pwd|mkdir|rm|cp|mv|touch|cat|echo|npm|node|git|curl|wget|chmod|sudo|apt|yum|pip|python|bash|sh|zsh|export|return|if|then|else|fi|for|in|do|done)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );
  } else if (["html", "xml"].includes(lower)) {
    out = out.replace(
      /(&lt;\/?)([a-zA-Z][\w:-]*)([\s\S]*?&gt;)/g,
      function (_, open, tag, rest) {
        const tagHtml = `${open}<span class="token-tag">${tag}</span>${rest}`;
        return stowToken(stash, tagHtml);
      }
    );
  } else if (["css"].includes(lower)) {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "token-string");

    out = out.replace(
      /\b[a-z-]+(?=\s*:)/g,
      function (match) {
        return stowToken(stash, `<span class="token-attr">${match}</span>`);
      }
    );
  } else {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/\/\/[^\n]*/g, "token-comment");
  }

  return restoreTokens(out, stash);
}

function renderCodeBlock(code, lang) {
  const language = String(lang || "").toLowerCase() || "text";
  const highlighted = highlightCode(code, language);
  return `<pre class="md-code"><code class="language-${language} code-${language}">${highlighted}</code></pre>`;
}

function renderMarkdown(text) {
  const raw = cleanReply(text);
  if (!raw) return "";

  const codeBlocks = [];
  let safe = raw.replace(/```([\w-]+)?\s*\n?([\s\S]*?)```/g, function (_, lang, code) {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({
      token,
      lang: String(lang || "").toLowerCase(),
      code,
    });
    return token;
  });

  safe = normalizeNumberedLines(safe);

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

  for (const line of lines) {
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
      html.push(
        `<h${level} class="md-h">${renderInlineMarkdown(content)}</h${level}>`
      );
      continue;
    }

    if (/^\-\s+/.test(trimmed)) {
      closePara();
      if (!inUl) {
        closeLists();
        html.push('<ul class="md-list">');
        inUl = true;
      }
      html.push(`<li>${renderInlineMarkdown(trimmed.replace(/^\-\s+/, ""))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      closePara();
      if (!inOl) {
        closeLists();
        html.push('<ol class="md-list">');
        inOl = true;
      }
      html.push(`<li>${renderInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeLists();
    if (!inPara) {
      html.push('<p class="md-p">');
      inPara = true;
    } else {
      html.push("<br>");
    }
    html.push(renderInlineMarkdown(trimmed));
  }

  closePara();
  closeLists();

  let out = html.join("");

  codeBlocks.forEach(function (block) {
    out = out.split(block.token).join(renderCodeBlock(block.code, block.lang));
  });

  return out;
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

function showCopipinBtBtntate(button) {
  if (!button) return;

  const originalHtml = button.innerHTML;
  const originalTitle = button.title;
  const originalLabel = button.getAttribute("aria-label");

  button.classList.add("copied");
  button.innerHTML = '<span class="action-icon">✓</span><span>Copied</span>';
  button.title = "Copied";
  button.setAttribute("aria-label", "Copied");

  window.setTimeout(() => {
    button.classList.remove("copied");
    button.innerHTML = originalHtml;
    if (originalTitle) button.title = originalTitle;
    if (originalLabel) button.setAttribute("aria-label", originalLabel);
  }, 1200);
}

let globalShareMenuCloserBound = false;

function bindGlobalShareMenuCloser() {
  if (globalShareMenuCloserBound) return;
  globalShareMenuCloserBound = true;

  document.addEventListener("click", function (event) {
    if (event.target.closest(".share-menu")) return;
    if (event.target.closest(".message-action-btn")) return;

    document.querySelectorAll(".share-menu.open").forEach((menu) => {
      menu.classList.remove("open");
    });

    document.querySelectorAll(".message-action-btn.active").forEach((btn) => {
      btn.classList.remove("active");
    });
  });
}

function createAssistantMessageShell(
  chatBox,
  rawText = "",
  { showShare = false, pinned = false, showRetry = false } = {}
) {
  const row = document.createElement("div");
  row.className = "chat-row assistant";

  const wrap = document.createElement("div");
  wrap.className = "assistant-message";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble md-content";
  bubble.dataset.rawText = cleanReply(rawText);

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "message-action-btn";
  copyBtn.innerHTML = '<span class="action-icon">⧉</span><span>Copy</span>';
  copyBtn.title = "Copy message";
  copyBtn.setAttribute("aria-label", "Copy message");

  copyBtn.addEventListener("click", async () => {
    const textToCopy = bubble.dataset.rawText || cleanReply(bubble.textContent);
    try {
      const copied = await copyTextToClipboard(textToCopy);
      if (copied) showCopiedState(copyBtn);
    } catch {
      // silent fail
    }
  });

  actions.appendChild(copyBtn);

  if (showRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "message-action-btn retry";
    retryBtn.innerHTML = '<span class="action-icon">↻</span><span>Retry</span>';
    retryBtn.title = "Retry response";
    retryBtn.setAttribute("aria-label", "Retry response");

    retryBtn.addEventListener("click", () => {
      if (typeof messageActionHandlers.onRetry === "function") {
        messageActionHandlers.onRetry();
      }
    });

    actions.appendChild(retryBtn);
  }

  let shareMenu = null;

  if (showShare) {
    bindGlobalShareMenuCloser();

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "message-action-btn";
    shareBtn.innerHTML = '<span class="action-icon">↗</span><span>Share</span>';
    shareBtn.title = "Share / Export";
    shareBtn.setAttribute("aria-label", "Share or export lesson");

    shareMenu = document.createElement("div");
    shareMenu.className = "share-menu";

    const createShareItem = (label, action, icon) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "share-menu-item";
      item.innerHTML = `<span class="action-icon">${icon}</span><span>${label}</span>`;

      item.addEventListener("click", (event) => {
        event.stopPropagation();

        if (typeof messageActionHandlers.onShare === "function") {
          messageActionHandlers.onShare(action);
        }

        shareMenu.classList.remove("open");
        shareBtn.classList.remove("active");
      });

      return item;
    };

    shareMenu.appendChild(createShareItem(pinned ? "Unpin Chat" : "Pin Chat", "pin", "📌"));
    shareMenu.appendChild(createShareItem("Share to apps", "native-share", "📤"));
    shareMenu.appendChild(createShareItem("Download .txt", "txt", "↓"));
    shareMenu.appendChild(createShareItem("Download .md", "md", "↓"));

    shareBtn.addEventListener("click", (event) => {
      event.stopPropagation();

      const isOpen = shareMenu.classList.contains("open");

      document.querySelectorAll(".share-menu.open").forEach((menu) => {
        menu.classList.remove("open");
      });
      document.querySelectorAll(".message-action-btn.active").forEach((btn) => {
        btn.classList.remove("active");
      });

      if (isOpen) return;

      shareMenu.classList.add("open");
      shareBtn.classList.add("active");
    });

    actions.appendChild(shareBtn);
  }

  wrap.appendChild(bubble);
  wrap.appendChild(actions);

  if (shareMenu) {
    wrap.appendChild(shareMenu);
  }

  row.appendChild(wrap);
  chatBox.appendChild(row);

  return bubble;
}

function createLessonToolsRow(chatBox, answerText = "") {
  const row = document.createElement("div");
  row.className = "lesson-tools";

  const buttons = [
    { label: "Explain Again", action: "explain" },
    { label: "Give Example", action: "example" },
    { label: "Quiz Me", action: "quiz" },
  ];

  buttons.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lesson-tool-btn";
    btn.textContent = item.label;

    btn.addEventListener("click", (event) => {
      event.stopPropagation();

      if (typeof messageActionHandlers.onLessonTool === "function") {
        messageActionHandlers.onLessonTool(item.action, {
          answerText: cleanReply(answerText),
        });
      }
    });

    row.appendChild(btn);
  });

  chatBox.appendChild(row);
  return row;
}

export function appendMessage(chatBox, msg, options = {}) {
  if (!chatBox || !msg) return null;

  const role = msg.role === "assistant" ? "assistant" : "user";

  if (role === "assistant") {
    if (msg.typing) {
      const row = document.createElement("div");
      row.className = "chat-row assistant";

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble typing";
      bubble.innerHTML =
        '<div class="typing-inner"><span class="typing-label">Thinking...</span><span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span></div>';

      row.appendChild(bubble);
      chatBox.appendChild(row);
      return bubble;
    }

    const bubble = createAssistantMessageShell(chatBox, msg.text, {
      showShare: Boolean(options.showShare),
      pinned: Boolean(options.pinned),
      showRetry: Boolean(options.showRetry) || Boolean(msg.error),
    });

    bubble.innerHTML = renderMarkdown(msg.text);
    bubble.dataset.rawText = cleanReply(msg.text);

    if (msg.error) {
      bubble.classList.add("error-state");
    }

    if (options.showLessonTools) {
      createLessonToolsRow(chatBox, msg.text);
    }

    return bubble;
  }

  const row = document.createElement("div");
  row.className = "chat-row user";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = cleanReply(msg.text);

  row.appendChild(bubble);
  chatBox.appendChild(row);

  return bubble;
}

export function createAssistantBubble(chatBox) {
  if (!chatBox) return null;
  return createAssistantMessageShell(chatBox, "", { showShare: false });
}

export function updateAssistantBubble(bubble, text) {
  if (!bubble) return;
  bubble.classList.add("md-content");
  bubble.innerHTML = renderMarkdown(text);
  bubble.dataset.rawText = cleanReply(text);
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
    appendMessage(chatBox, msg, {
      showShare: true,
      showLessonTools: msg.role === "assistant" && !msg.typing,
      pinned: Boolean(session.pinned),
      showRetry: Boolean(msg.error),
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
    mainBtn.className = `history-item-main ${session.id === currentChatId ? "active" : ""}`;
    mainBtn.textContent = session.title || "New Chat";

    mainBtn.addEventListener("click", () => {
      if (typeof handlers.onSwitch === "function") {
        handlers.onSwitch(session.id);
      }
    });

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "history-mini-btn";
    pinBtn.title = session.pinned ? "Unpin chat" : "Pin chat";
    pinBtn.setAttribute("aria-label", session.pinned ? "Unpin chat" : "Pin chat");
    pinBtn.textContent = session.pinned ? "📌" : "📍";

    pinBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onPin === "function") {
        handlers.onPin(session.id);
      }
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "history-mini-btn";
    renameBtn.title = "Rename chat";
    renameBtn.setAttribute("aria-label", "Rename chat");
    renameBtn.textContent = "✎";

    renameBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onRename === "function") {
        handlers.onRename(session.id);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-mini-btn danger";
    deleteBtn.title = "Delete chat";
    deleteBtn.setAttribute("aria-label", "Delete chat");
    deleteBtn.textContent = "🗑";

    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof handlers.onDelete === "function") {
        handlers.onDelete(session.id);
      }
    });

    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.appendChild(pinBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(mainBtn);
    row.appendChild(actions);
    historyList.appendChild(row);
  });
}

export function updateWelcomeState(welcomeScreen, session) {
  if (!welcomeScreen) return;

  const hasMessages =
    session && Array.isArray(session.messages) && session.messages.length > 0;

  welcomeScreen.hidden = !!hasMessages;
}
