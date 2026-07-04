  async function sendMessage() {
    const message = input.value.trim();
    if (message === "") return;

    // 1. Update UI for sending
    const userMsg = { role: "user", text: message, ts: Date.now() };
    messages.push(userMsg);
    saveMessages(messages);
    appendMessage(userMsg);

    input.value = "";
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    // 2. Add temporary typing indicator
    appendMessage({ role: "assistant", text: "", typing: true, ts: Date.now() });
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

    try {
      // 3. Send request expecting a standard JSON response
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      // 4. Success: remove indicator and show result
      removeTypingPlaceholders();

      // Ensure 'data.reply' matches the property name your backend sends
      const fullReply = data.reply || data.text || "No response content.";
      
      const assistantMsg = { 
        role: "assistant", 
        text: fullReply.trim(), 
        ts: Date.now() 
      };

      messages.push(assistantMsg);
      saveMessages(messages);
      appendMessage(assistantMsg);

    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders();

      const errMsg = {
        role: "assistant",
        text: err.message || "Sorry, something went wrong. Please try again.",
        ts: Date.now(),
      };

      // Optional: Add error to history? 
      // messages.push(errMsg); // Keep this if you want errors in history
      appendMessage(errMsg);
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
      chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
    }
  }


