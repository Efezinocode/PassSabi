document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("btn");

  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "chat.html";
    });
  }

  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chat-box");

  if (!sendBtn || !input || !chatBox) return;

  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = input.value.trim();

    if (message === "") return;

    appendRow("user", message);
    input.value = "";

    const typingRow = appendRow("assistant", "…", true);
    sendBtn.disabled = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      // Read raw response text first so we can show non-JSON errors too
      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (e) {
        // not JSON
      }

      if (!response.ok) {
        // prefer explicit error fields from server
        const errMsg = (data && (data.error || data.details)) || raw || "Something went wrong.";
        throw new Error(errMsg);
      }

      const replyText = (data && data.reply) || raw || "";

      typingRow.bubble.textContent = cleanReply(replyText);
      typingRow.bubble.classList.remove("typing");
    } catch (error) {
      console.error("Chat error:", error);
      // Show the server-provided message if available to help debugging
      typingRow.bubble.textContent = error?.message
        ? String(error.message)
        : "Sorry, I could not get a response right now. Please try again.";
      typingRow.bubble.classList.remove("typing");
    } finally {
      sendBtn.disabled = false;
      input.focus();
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  function appendRow(role, text, typing = false) {
    const row = document.createElement("div");
    row.className = `chat-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    if (typing) bubble.classList.add("typing");

    bubble.textContent = cleanReply(text);

    row.appendChild(bubble);
    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;

    return { row, bubble };
  }

  function cleanReply(text) {
    return String(text)
      .replace(/\r\n/g, "\n")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[*-]\s+/gm, "• ")
      .trim();
  }
});
