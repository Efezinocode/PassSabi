document.addEventListener("DOMContentLoaded", function () {
    // Open the chat page from the home page
    const btn = document.getElementById("btn");

    if (btn) {
        btn.addEventListener("click", function () {
            window.location.href = "chat.html";
        });
    }

    // Chat page send button
    const sendBtn = document.getElementById("sendBtn");

    if (sendBtn) {
        sendBtn.addEventListener("click", sendMessage);
    }

    // Allow Enter key to send on the chat page
    const input = document.getElementById("userInput");

    if (input) {
        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                sendMessage();
            }
        });
    }

    function sendMessage() {
        const input = document.getElementById("userInput");
        const chatBox = document.getElementById("chat-box");

        if (!input || !chatBox) return;

        const message = input.value.trim();
        if (message === "") return;

        const userMessage = document.createElement("p");
        const userStrong = document.createElement("strong");
        userStrong.textContent = "You: ";
        userMessage.appendChild(userStrong);
        userMessage.appendChild(document.createTextNode(message));
        chatBox.appendChild(userMessage);

        const botMessage = document.createElement("p");
        const botStrong = document.createElement("strong");
        botStrong.textContent = "PassSabi AI: ";
        botMessage.appendChild(botStrong);
        botMessage.appendChild(document.createTextNode("I'm still under development. Soon I'll answer your questions with AI."));
        chatBox.appendChild(botMessage);

        chatBox.scrollTop = chatBox.scrollHeight;

        input.value = "";
    }
});

