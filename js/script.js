// script.js

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

    // Add user message
    const userMsg = { role: "user", text: message, ts: Date.now() };
    messages.push(userMsg);
    saveMessages(messages);
    appendMessage(userMsg);

    input.value = "";
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    // Add typing indicator
    const typingElement = appendTypingIndicator();

    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      // Remove typing indicator
      removeTypingPlaceholders();

      // Create assistant message bubble
      const assistantMsgElement = createAssistantBubble();
      let currentText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.chunk) {
                currentText += data.chunk;
                fullReply += data.chunk;
                updateAssistantBubble(assistantMsgElement, currentText);
              }

              if (data.done) {
                // Final message with provider info (optional)
                console.log(`Answered by: ${data.provider}`);
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }

        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
      }

      // Save final message
      const assistantMsg = { role: "assistant", text: fullReply.trim(), ts: Date.now() };
      messages.push(assistantMsg);
      saveMessages(messages);

    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders();

      const errMsg = {
        role: "assistant",
        text: err.message || "Sorry, something went wrong. Please try again.",
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

  // Helper Functions
  function appendMessage(msg) {
    const row = document.createElement("div");
    row.className = `chat-row ${msg.role}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = cleanReply(msg.text);

    row.appendChild(bubble);
    chatBox.appendChild(row);
  }

  function appendTypingIndicator() {
    const row = document.createElement("div");
    row.className = "chat-row assistant";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble typing";
    bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

    row.appendChild(bubble);
    chatBox.appendChild(row);
    return row;
  }

  function createAssistantBubble() {
    const row = document.createElement("div");
    row.className = "chat-row assistant";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = "";

    row.appendChild(bubble);
    chatBox.appendChild(row);
    return bubble;
  }

  function updateAssistantBubble(bubble, text) {
    bubble.textContent = cleanReply(text);
  }

  function removeTypingPlaceholders() {
    chatBox.querySelectorAll(".chat-row.assistant .chat-bubble.typing")
      .forEach(ph => ph.closest(".chat-row").remove());
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
