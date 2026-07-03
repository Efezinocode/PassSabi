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

  if (!sendBtn || !input || !chatBox) {
    return;
  }

  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = input.value.trim();

    if (message === "") {
      return;
    }

    appendMessage("user", "You: ", message, false);
    input.value = "";

    const loadingMessage = appendMessage("assistant", "PassSabi AI: ", "Thinking...", false);
    sendBtn.disabled = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      loadingMessage.content.innerHTML = renderMarkdown(data.reply);
    } catch (error) {
      loadingMessage.content.textContent =
        "Sorry, I could not get a response right now. Please try again.";
    } finally {
      sendBtn.disabled = false;
      input.focus();
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  function appendMessage(role, label, text, markdown) {
    const messageElement = document.createElement("p");
    messageElement.className = `chat-message ${role}`;

    const strongElement = document.createElement("strong");
    strongElement.textContent = label;
    messageElement.appendChild(strongElement);

    const contentSpan = document.createElement("span");

    if (markdown) {
      contentSpan.innerHTML = renderMarkdown(text);
    } else {
      contentSpan.textContent = text;
    }

    messageElement.appendChild(contentSpan);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    return {
      element: messageElement,
      content: contentSpan,
    };
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);

    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/^-\s(.+)$/gm, "• $1");
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
});

