// Open the chat page
const btn = document.getElementById("btn");

if (btn) {
    btn.addEventListener("click", function () {
        window.location.href = "chat.html";
    });
}

// Chat page
const sendBtn = document.getElementById("sendBtn");

if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
}

function sendMessage() {
    const input = document.getElementById("userInput");
    const chatBox = document.getElementById("chat-box");

    if (!input || !chatBox) return;

    const message = input.value.trim();

    if (message === "") return;

    chatBox.innerHTML += `<p><strong>You:</strong> ${message}</p>`;
    chatBox.innerHTML += `<p><strong>PassSabi AI:</strong> I'm still under development. Soon I'll answer your questions with AI.</p>`;

    input.value = "";
}

