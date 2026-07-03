document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("btn");
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chat-box");
  const clearBtn = document.getElementById("clearBtn");
  const form = document.getElementById("chat-form");
  const STORAGE_KEY = "passsabi_messages_v1";

  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "chat.html";
    });
  }

  if (!chatBox || !input || !form) return;

  let messages = loadMessages();
  renderMessages(messages);

  input.focus();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (!confirm("Clear chat history?")) return;
      messages = [];
      saveMessages(messages);
      chatBox.innerHTML = "";
    });
  }

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = input.value.trim();
    if (message === "") return;

    const userMsg = { role: "user", text: message, ts: Date.now() };
    messages.push(userMsg);
    saveMessages(messages);
    appendMessage(userMsg);

    input.value = "";
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    appendMessage({ role: "assistant", text: "", typing: true, ts: Date.now() });
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const raw = await response.text();
      let data = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errMsg =
          (data && (data.error || data.details)) || raw || "Something went wrong.";
        throw new Error(errMsg);
      }

      removeTypingPlaceholders();

      const replyText = cleanReply(
        (data && (data.reply || data.response || data.text)) || raw || ""
      );

      const assistantMsg = { role: "assistant", text: replyText, ts: Date.now() };
      messages.push(assistantMsg);
      saveMessages(messages);
      appendMessage(assistantMsg);
    } catch (err) {
      console.error("Chat error:", err);

      removeTypingPlaceholders();

      const errMsg = {
        role: "assistant",
        text: err && err.message ? String(err.message) : "Sorry, something went wrong.",
        ts: Date.now(),
      };

      messages.push(errMsg);
      saveMessages(messages);
      appendMessage(errMsg);
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
      chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
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
        '<span class="typing-dots"><span></span><span></span><span></span></span>';
    } else {
      bubble.textContent = cleanReply(msg.text);
    }

    row.appendChild(bubble);
    chatBox.appendChild(row);
    return { row, bubble };
  }

  function removeTypingPlaceholders() {
    chatBox
      .querySelectorAll(".chat-row.assistant .chat-bubble.typing")
      .forEach((ph) => {
        const row = ph.closest(".chat-row");
        if (row) row.remove();
      });
  }

  function renderMessages(list) {
    chatBox.innerHTML = "";
    list.forEach((m) => appendMessage(m));
    chatBox.scrollTo({ top: chatBox.scrollHeight });
  }

  function saveMessages(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save messages", e);
    }
  }

  function loadMessages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
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
