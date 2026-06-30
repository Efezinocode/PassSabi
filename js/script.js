// Logic for Index Page
const btn = document.getElementById("btn");
if (btn) {
    btn.addEventListener("click", function () {
        window.location.href = "chat.html";
    });
}

// Logic for Chat Page
const sendBtn = document.getElementById("sendBtn");
if (sendBtn) {
    const userInput = document.getElementById("userInput");
    const chatBox = document.getElementById("chat-box");

    sendBtn.onclick = function () {
        const message = userInput.value;
        if (message.trim() !== "") {
            chatBox.innerHTML += `<p><strong>You:</strong> ${message}</p>`;
            userInput.value = "";
            
            // Add a simulated AI response
            setTimeout(() => {
                chatBox.innerHTML += `<p><strong>PassSabi AI:</strong> I'm working on your request: "${message}"</p>`;
            }, 500);
        }
    };
}

