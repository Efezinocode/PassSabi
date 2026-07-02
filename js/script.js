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

    appendMessage("You: ", message);
    input.value = "";

    const loadingMessage = appendMessage("PassSabi AI: ", "Thinking...");
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

      loadingMessage.lastChild.textContent = data.reply;
    } catch (error) {
      loadingMessage.lastChild.textContent =
        "Sorry, I could not get a response right now. Please try again.";
    } finally {
      sendBtn.disabled = false;
      input.focus();
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  function appendMessage(label, text) {
    const messageElement = document.createElement("p");
    const strongElement = document.createElement("strong");
    strongElement.textContent = label;
    messageElement.appendChild(strongElement);
    messageElement.appendChild(document.createTextNode(text));
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageElement;
  }
});

