import {
  createSession,
  loadSessions,
  loadCurrentChatId,
  saveSessions,
  saveCurrentChatId,
  migrateLegacyMessages,
  removeLegacyMessagesKey,
  makeSessionTitle,
} from "./storage.js";

import { bindSidebarEvents, closeSidebar } from "./sidebar.js";

import {
  appendMessage,
  appendTypingIndicator,
  autoResizeInput,
  autoScrollIfNeeded,
  cleanReply,
  createAssistantBubble,
  renderCurrentSession,
  renderHistory,
  removeTypingPlaceholders,
  scrollToBottom,
  setSendButtonState,
  setMessageActionHandlers,
  updateAssistantBubble,
  updateWelcomeState,
} from "./ui.js";

import { streamChatReply } from "./api.js";

document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("btn");
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chat-box");
  const form = document.getElementById("chat-form");

  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const newChatBtn = document.getElementById("newChatBtn");
  const chatSearch = document.getElementById("chatSearch");
  const historyList = document.getElementById("chat-history");
  const welcomeScreen = document.getElementById("welcome-screen");

  const DEFAULT_PLACEHOLDER = "Type your question here...";

  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "chat.html";
    });
  }

  if (!chatBox || !input || !form) return;

  let sessions = loadSessions();
  let currentChatId = loadCurrentChatId();
  let searchQuery = "";

  if (!Array.isArray(sessions)) sessions = [];

  if (sessions.length === 0) {
    const migrated = migrateLegacyMessages();
    if (migrated) {
      sessions.push(migrated);
      removeLegacyMessagesKey();
    } else {
      sessions.push(createSession("New Chat"));
    }
    currentChatId = sessions[0].id;
    saveSessions(sessions);
    saveCurrentChatId(currentChatId);
  } else if (
    !currentChatId ||
    !sessions.some(function (session) {
      return session.id === currentChatId;
    })
  ) {
    currentChatId = sessions[0].id;
    saveCurrentChatId(currentChatId);
  }

  let isGenerating = false;
  let activeController = null;
  let activeAssistantBubble = null;
  let activePartialText = "";

  function getCurrentSession() {
    return sessions.find(function (session) {
      return session.id === currentChatId;
    }) || null;
  }

  function clearTransientStatus() {
    chatBox.querySelectorAll(".transient-status").forEach((node) => node.remove());
  }

  function syncCurrentSessionRender() {
    renderCurrentSession(chatBox, getCurrentSession());
    updateWelcomeState(welcomeScreen, getCurrentSession());
    scrollToBottom(chatBox, false);
  }

  function refreshHistory() {
    const query = searchQuery.trim().toLowerCase();
    const visibleSessions = !query
      ? sessions
      : sessions.filter(function (session) {
          const title = String(session.title || "").toLowerCase();
          const messagesText = Array.isArray(session.messages)
            ? session.messages.map((msg) => String(msg.text || "")).join(" ").toLowerCase()
            : "";
          return title.includes(query) || messagesText.includes(query);
        });

    if (!historyList) return;
    renderHistory(historyList, visibleSessions, currentChatId, {
      onSwitch: switchSession,
      onDelete: deleteSession,
      onPin: toggleCurrentChatPin,
      onRename: renameSession,
    });
  }

  function renderAll() {
    syncCurrentSessionRender();
    refreshHistory();
  }

  function setGeneratingState(nextState) {
    isGenerating = nextState;
    input.disabled = nextState;
    input.placeholder = nextState ? "PassSabi is thinking..." : DEFAULT_PLACEHOLDER;
    setSendButtonState(sendBtn, nextState);
  }

  function stopGenerating() {
    if (!isGenerating || !activeController) return;
    activeController.abort();
  }

  function ensureSessionExists() {
    if (sessions.length === 0) {
      const fresh = createSession("New Chat");
      sessions = [fresh];
      currentChatId = fresh.id;
      saveSessions(sessions);
      saveCurrentChatId(currentChatId);
    }
  }

  function sanitizeFileName(value) {
    return String(value || "PassSabi-Chat")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
  }

  function getExportBaseName(session) {
    const title = sanitizeFileName(session?.title || "PassSabi-Chat");
    const date = new Date().toISOString().slice(0, 10);
    return `PassSabi-${title}-${date}`;
  }

  function buildPlainTextExport(session) {
    const lines = [];
    const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

    lines.push("PassSabi AI Chat");
    lines.push(`Title: ${session?.title || "New Chat"}`);
    lines.push(`Created: ${createdAt.toLocaleString()}`);
    lines.push(`Pinned: ${session?.pinned ? "Yes" : "No"}`);
    lines.push("");
    lines.push("Conversation");
    lines.push("------------");
    lines.push("");

    (session?.messages || []).forEach(function (msg) {
      const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
      lines.push(`${speaker}:`);
      lines.push(String(msg.text || "").trim());
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  function buildMarkdownExport(session) {
    const lines = [];
    const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

    lines.push(`# PassSabi AI Chat`);
    lines.push("");
    lines.push(`**Title:** ${session?.title || "New Chat"}`);
    lines.push(`**Created:** ${createdAt.toLocaleString()}`);
    lines.push(`**Pinned:** ${session?.pinned ? "Yes" : "No"}`);
    lines.push("");
    lines.push(`## Conversation`);
    lines.push("");

    (session?.messages || []).forEach(function (msg) {
      const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
      lines.push(`### ${speaker}`);
      lines.push("");
      lines.push(String(msg.text || "").trim());
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "").trim();
    if (!value) return false;

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const temp = document.createElement("textarea");
    temp.value = value;
    temp.setAttribute("readonly", "");
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch {
      success = false;
    }

    document.body.removeChild(temp);
    return success;
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], {
      type: mimeType || "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function handleShareAction(action) {
    const session = getCurrentSession();
    if (!session) return;

    const baseName = getExportBaseName(session);
    const plainText = buildPlainTextExport(session);
    const markdown = buildMarkdownExport(session);

    if (action === "pin") {
      toggleCurrentChatPin();
      return;
    }

    if (action === "native-share") {
      const shareData = {
        title: session.title || "PassSabi AI Chat",
        text: plainText,
        url: window.location.href,
      };

      try {
        if (navigator.share) await navigator.share(shareData);
        else await copyTextToClipboard(plainText);
      } catch (error) {
        console.warn("Native share failed:", error);
      }
      return;
    }

    if (action === "txt") {
      downloadTextFile(`${baseName}.txt`, plainText, "text/plain;charset=utf-8");
      return;
    }

    if (action === "md") {
      downloadTextFile(`${baseName}.md`, markdown, "text/markdown;charset=utf-8");
    }
  }

  function buildStudyModePrompt(message) {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();

    if (
      lower.includes("do an exam") ||
      lower.includes("practice exam") ||
      lower.includes("mock exam") ||
      lower.includes("exam me") ||
      lower.includes("test me") ||
      lower.includes("set an exam")
    ) {
      return {
        visibleText: text,
        promptText:
          "Create a full practice exam for a student on this topic. Give exactly 30 objective questions, numbered from 1 to 30, each with 4 options (A, B, C, D) and the correct answer after each question. After the objectives, add a theory section with 5 theory questions. Keep the numbering sequential and never restart at 1.\n\nTopic:\n" +
          text,
      };
    }

    if (
      lower.includes("quiz me") ||
      lower.includes("quiz") ||
      lower.includes("give me a quiz")
    ) {
      return {
        visibleText: text,
        promptText:
          "Create a short quiz on this topic with only 3 to 5 questions. Number the questions properly from 1 onward and do not restart at 1. Keep it simple and student-friendly.\n\nTopic:\n" +
          text,
      };
    }

    return null;
  }

  function buildLessonPrompt(action, answerText) {
    const session = getCurrentSession();
    const lastUser = session
      ? [...session.messages].reverse().find(function (msg) {
          return msg.role === "user";
        })
      : null;

    const topic = String(lastUser?.text || answerText || session?.title || "this topic").trim();

    if (action === "explain") {
      return {
        visibleText: "Explain again",
        promptText:
          "Explain this topic in simpler words for a student. Use short sentences, step by step, and make it easy to understand. If you number items, number them properly as 1., 2., 3. and do not repeat 1.\n\nTopic:\n" +
          topic,
      };
    }

    if (action === "example") {
      return {
        visibleText: "Give example",
        promptText:
          "Give one or two simple real-life examples for this topic and explain them clearly. If you number items, number them properly as 1., 2., 3. and do not repeat 1.\n\nTopic:\n" +
          topic,
      };
    }

    if (action === "quiz") {
      return {
        visibleText: "Quiz me",
        promptText:
          "Create a short quiz on this topic with only 3 to 5 questions. Number the questions properly from 1 onward and do not restart at 1. Keep it simple for a student.\n\nTopic:\n" +
          topic,
      };
    }

    return null;
  }

  async function handleLessonToolAction(action, context = {}) {
    if (isGenerating) return;
    const lesson = buildLessonPrompt(action, context.answerText || "");
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

  function renameSession(sessionId = currentChatId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const nextTitle = window.prompt("Rename chat", session.title || "New Chat");
    if (nextTitle === null) return;

    const cleanTitle = String(nextTitle).trim();
    if (!cleanTitle) return;

    session.title = cleanTitle;
    session.updatedAt = Date.now();

    saveSessions(sessions);
    renderAll();
  }

  function retryLastResponse() {
    if (isGenerating) return;

    const session = getCurrentSession();
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

  function toggleCurrentChatPin(sessionId = currentChatId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    session.pinned = !session.pinned;
    session.updatedAt = Date.now();

    saveSessions(sessions);
    refreshHistory();
    renderAll();
  }

  function switchSession(sessionId) {
    if (isGenerating) stopGenerating();
    currentChatId = sessionId;
    saveCurrentChatId(currentChatId);
    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function startNewChat() {
    if (isGenerating) stopGenerating();

    const current = getCurrentSession();
    if (current && current.messages.length === 0) {
      closeSidebar(sidebar, backdrop, menuBtn);
      input.blur();
      return;
    }

    const newSession = createSession("New Chat");
    sessions.unshift(newSession);
    currentChatId = newSession.id;

    saveCurrentChatId(currentChatId);
    saveSessions(sessions);

    renderAll();
    closeSidebar(sidebar, backdrop, menuBtn);
    input.blur();
  }

  function deleteSession(sessionId) {
    if (isGenerating && sessionId === currentChatId) stopGenerating();

    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const label = session.title || "this chat";
    if (!confirm(`Delete "${label}"?`)) return;

    const deletingCurrent = sessionId === currentChatId;
    sessions = sessions.filter((item) => item.id !== sessionId);

    if (sessions.length === 0) {
      const fresh = createSession("New Chat");
      sessions = [fresh];
      currentChatId = fresh.id;
    } else if (deletingCurrent) {
      currentChatId = sessions[0].id;
    }

    saveSessions(sessions);
    saveCurrentChatId(currentChatId);
    renderAll();
  }

  async function startGeneration(message, options = {}) {
    const {
      appendUserMessage = true,
      clearInput = false,
      visibleText = null,
      promptText = null,
      autoTitle = true,
    } = options;

    const session = getCurrentSession();
    if (!session || isGenerating) return;

    clearTransientStatus();

    const promptSource = promptText ?? message;
    const prompt = String(promptSource || "").trim();
    if (!prompt) return;

    const visibleMessage = String(visibleText ?? message ?? prompt).trim();

    if (appendUserMessage) {
      const userMsg = { role: "user", text: visibleMessage, ts: Date.now() };
      session.messages.push(userMsg);

if (autoTitle && session.title === "New Chat") {
  session.title = makeSessionTitle(visibleMessage);
}

session.updatedAt = Date.now();
saveSessions(sessions);

if (welcomeScreen) {
  welcomeScreen.hidden = true;
}

appendMessage(chatBox, userMsg);
refreshHistory();
updateWelcomeState(welcomeScreen, session);

      if (clearInput) {
        input.value = "";
        autoResizeInput(input);
      }

      input.blur();
    }

    appendTypingIndicator(chatBox);
    scrollToBottom(chatBox, false);

    const controller = new AbortController();
    activeController = controller;
    activeAssistantBubble = null;
    activePartialText = "";
    setGeneratingState(true);

    const timeoutId = setTimeout(function () {
      controller.abort();
    }, 90000);

    try {
      const finalText = await streamChatReply({
        message: prompt,
        signal: controller.signal,
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
      if (!cleanText) throw new Error("No response text found.");

      const assistantMsg = { role: "assistant", text: cleanText, ts: Date.now() };
      session.messages.push(assistantMsg);
      session.updatedAt = Date.now();
      saveSessions(sessions);

      renderAll();
      scrollToBottom(chatBox, false);
    } catch (err) {
      console.error("Chat error:", err);
      removeTypingPlaceholders(chatBox);

      const partial = cleanReply(activePartialText || "");
      if (partial) {
        const assistantMsg = { role: "assistant", text: partial, ts: Date.now() };
        session.messages.push(assistantMsg);
        session.updatedAt = Date.now();
        saveSessions(sessions);
        renderAll();
        scrollToBottom(chatBox, false);
      } else if (err?.name !== "AbortError") {
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

  ensureSessionExists();
  renderAll();
  autoResizeInput(input);
  setSendButtonState(sendBtn, false);

  setMessageActionHandlers({
    onShare: handleShareAction,
    onLessonTool: handleLessonToolAction,
    onRetry: retryLastResponse,
  });

  bindSidebarEvents({
    menuBtn,
    sidebar,
    backdrop,
    newChatBtn,
    onNewChat: startNewChat,
  });

  if (chatSearch) {
    chatSearch.addEventListener("input", function () {
      searchQuery = chatSearch.value || "";
      refreshHistory();
    });

    chatSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        chatSearch.value = "";
        searchQuery = "";
        refreshHistory();
        chatSearch.blur();
      }
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopPropagation();

    if (isGenerating) {
      stopGenerating();
      return;
    }

    sendMessage();
  });

  input.addEventListener("input", function () {
    autoResizeInput(input);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      if (input.tagName === "TEXTAREA") {
        event.preventDefault();
        if (!isGenerating) sendMessage();
      }
    }
  });
});
