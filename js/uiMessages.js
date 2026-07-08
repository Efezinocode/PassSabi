import { getMessageActionHandlers } from "./uiHandlers.js";
import { renderMarkdown, cleanReply } from "./uiText.js";

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

function showCopiedState(button) {
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

function createLessonToolsRow(chatBox, answerText = "") {
  const handlers = getMessageActionHandlers();

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

      if (typeof handlers.onLessonTool === "function") {
        handlers.onLessonTool(item.action, {
          answerText: cleanReply(answerText),
        });
      }
    });

    row.appendChild(btn);
  });

  chatBox.appendChild(row);
  return row;
}

function createAssistantMessageShell(
  chatBox,
  rawText = "",
  { showShare = false, pinned = false, showRetry = false } = {}
) {
  const handlers = getMessageActionHandlers();

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
      if (typeof handlers.onRetry === "function") {
        handlers.onRetry();
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

        if (typeof handlers.onShare === "function") {
          handlers.onShare(action);
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
        '<span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';

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
