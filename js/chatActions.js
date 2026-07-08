// js/chatActions.js

export function createChatActionsController({
  state,
  chatBox,
  input,
  sendBtn,
  defaultPlaceholder,
  saveSessions,
  renderAll,
  appendMessage,
  appendTypingIndicator,
  autoScrollIfNeeded,
  cleanReply,
  createAssistantBubble,
  removeTypingPlaceholders,
  scrollToBottom,
  setSendButtonState,
  updateAssistantBubble,
  autoResizeInput,
  streamChatReply,
  buildStudyModePrompt,
  buildLessonPrompt,
  getCurrentSession,
  makeSessionTitle,
}) {
  let generating = false;
  let activeController = null;
  let activeAssistantBubble = null;
  let activePartialText = "";
  let timeoutId = null;

  function isGenerating() {
    return generating;
  }

  function setGeneratingState(nextState) {
    generating = nextState;
    input.disabled = nextState;
    input.placeholder = nextState
      ? "PassSabi is thinking..."
      : (defaultPlaceholder || "Type your question here...");
    setSendButtonState(sendBtn, nextState);
  }

  function clearTransientStatus() {
    chatBox
      .querySelectorAll(".transient-status")
      .forEach(function (node) {
        node.remove();
      });
  }

  function stopGenerating() {
    if (!generating || !activeController) return;
    activeController.abort();
  }

  async function startGeneration(message, options = {}) {
    const {
      appendUserMessage = true,
      clearInput = false,
      visibleText = null,
      promptText = null,
      autoTitle = true,
    } = options;

    const session = typeof getCurrentSession === "function" ? getCurrentSession() : null;
    if (!session) return;
    if (generating) return;

    clearTransientStatus();

    const promptSource = promptText ?? message;
    const prompt = String(promptSource || "").trim();
    if (!prompt) return;

    const visibleMessage = String(visibleText ?? message ?? prompt).trim();

    if (appendUserMessage) {
      const userMsg = {
        role: "user",
        text: visibleMessage,
        ts: Date.now(),
      };

      session.messages.push(userMsg);

      if (autoTitle && session.title === "New Chat") {
        session.title = makeSessionTitle(visibleMessage);
      }

      session.updatedAt = Date.now();
      saveSessions(state.sessions);

      appendMessage(chatBox, userMsg);
      renderAll();

      if (clearInput) {
        input.value = "";
        autoResizeInput(input);
      }

      input.blur();
    }

    appendTypingIndicator(chatBox);
    scrollToBottom(chatBox, false);

    activeController = new AbortController();
    activeAssistantBubble = null;
    activePartialText = "";
    setGeneratingState(true);

    timeoutId = setTimeout(function () {
      activeController && activeController.abort();
    }, 90000);

    try {
      const finalText = await streamChatReply({
        message: prompt,
        signal: activeController.signal,
        onChunk: function (_chunk, fullText) {
          activePartialText = fullText;

          if (!activeAssistantBubble) {
            removeTypingPlaceholders(chatBox);
            activeAssistantBubble = createAssistantBubble(chatBox);
          }

          updateAssistantBubble(activeAssistantBubble, fullText);
          autoScrollIfNeeded(chatBox, 80, false);
        },
        onDone: function (provider) {
          console.log("Answered by:", provider);
        },
      });

      removeTypingPlaceholders(chatBox);

      const cleanText = cleanReply(finalText || activePartialText || "No response.");
      if (!cleanText) {
        throw new Error("No response text found.");
      }

      session.messages.push({
        role: "assistant",
        text: cleanText,
        ts: Date.now(),
      });

      session.updatedAt = Date.now();
      saveSessions(state.sessions);

      renderAll();
      scrollToBottom(chatBox, false);
    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders(chatBox);

      const partial = cleanReply(activePartialText || "");

      if (partial) {
        session.messages.push({
          role: "assistant",
          text: partial,
          ts: Date.now(),
        });

        session.updatedAt = Date.now();
        saveSessions(state.sessions);

        renderAll();
        scrollToBottom(chatBox, false);
      } else if (err.name !== "AbortError") {
        appendMessage(
          chatBox,
          {
            role: "assistant",
            text: "I could not get a response right now. Please tap Retry.",
            error: true,
            ts: Date.now(),
          },
          { showRetry: true }
        );
      }
    } finally {
      clearTimeout(timeoutId);
      activeController = null;
      activeAssistantBubble = null;
      activePartialText = "";
      setGeneratingState(false);
      input.blur();
      autoResizeInput(input);
      scrollToBottom(chatBox, false);
    }
  }

  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    const studyPrompt = buildStudyModePrompt(message);

    startGeneration(message, {
      appendUserMessage: true,
      clearInput: true,
      visibleText: message,
      promptText: studyPrompt ? studyPrompt.promptText : message,
      autoTitle: true,
    });
  }

  function handleLessonToolAction(action, context = {}) {
    if (generating) return;

    const session = typeof getCurrentSession === "function" ? getCurrentSession() : null;
    const lesson = buildLessonPrompt(action, context.answerText || "", session);
    if (!lesson) return;

    clearTransientStatus();

    startGeneration(lesson.visibleText, {
      appendUserMessage: true,
      clearInput: false,
      visibleText: lesson.visibleText,
      promptText: lesson.promptText,
      autoTitle: false,
    });
  }

  function retryLastResponse() {
    if (generating) return;

    const session = typeof getCurrentSession === "function" ? getCurrentSession() : null;
    if (!session) return;

    const lastUser = [...session.messages].reverse().find(function (msg) {
      return msg.role === "user";
    });

    if (!lastUser) return;

    clearTransientStatus();

    startGeneration(lastUser.text, {
      appendUserMessage: false,
      clearInput: false,
      visibleText: "Retry",
      promptText: lastUser.text,
      autoTitle: false,
    });
  }

  return {
    isGenerating,
    stopGenerating,
    sendMessage,
    startGeneration,
    handleLessonToolAction,
    retryLastResponse,
    clearTransientStatus,
  };
                    }
