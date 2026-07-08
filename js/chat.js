// js/chat.js
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
  autoResizeInput,
  setMessageActionHandlers,
  appendMessage,
  appendTypingIndicator,
  autoScrollIfNeeded,
  cleanReply,
  createAssistantBubble,
  renderCurrentSession,
  renderHistory,
  removeTypingPlaceholders,
  scrollToBottom,
  setSendButtonState,
  updateAssistantBubble,
  updateWelcomeState,
} from "./ui.js";

import { streamChatReply } from "./api.js";

import { buildStudyModePrompt, buildLessonPrompt } from "./chatStudy.js";
import { createChatSessionController } from "./chatSession.js";
import { createChatShareController } from "./chatShare.js";
import { createChatActionsController } from "./chatActions.js";

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

  const DEFAULT_PLACEHOLDER = input?.getAttribute("placeholder") || "Type your question here...";

  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "chat.html";
    });
  }

  if (!chatBox || !input || !form) return;

  const state = {
    sessions: loadSessions(),
    currentChatId: loadCurrentChatId(),
    searchQuery: "",
  };

  if (state.sessions.length === 0) {
    const migrated = migrateLegacyMessages();

    if (migrated) {
      state.sessions.push(migrated);
      removeLegacyMessagesKey();
    } else {
      state.sessions.push(createSession("New Chat"));
    }

    state.currentChatId = state.sessions[0].id;
    saveSessions(state.sessions);
    saveCurrentChatId(state.currentChatId);
  } else if (
    !state.currentChatId ||
    !state.sessions.some(function (session) {
      return session.id === state.currentChatId;
    })
  ) {
    state.currentChatId = state.sessions[0].id;
    saveCurrentChatId(state.currentChatId);
  }

  const sessionCtrl = createChatSessionController({
    state,
    chatBox,
    historyList,
    welcomeScreen,
    input,
    sidebar,
    backdrop,
    menuBtn,
    saveSessions,
    saveCurrentChatId,
    createSession,
    renderCurrentSession,
    renderHistory,
    updateWelcomeState,
    scrollToBottom,
    closeSidebar,
  });

  const shareCtrl = createChatShareController({
    getCurrentSession: sessionCtrl.getCurrentSession,
    toggleCurrentChatPin: sessionCtrl.toggleCurrentChatPin,
  });

  const actionsCtrl = createChatActionsController({
    state,
    chatBox,
    input,
    sendBtn,
    defaultPlaceholder: DEFAULT_PLACEHOLDER,
    saveSessions,
    renderAll: sessionCtrl.renderAll,
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
    getCurrentSession: sessionCtrl.getCurrentSession,
    makeSessionTitle,
  });

  sessionCtrl.setBeforeSessionChange(actionsCtrl.stopGenerating);

  sessionCtrl.ensureSessionExists();
  sessionCtrl.renderAll();
  autoResizeInput(input);

  setMessageActionHandlers({
    onShare: shareCtrl.handleShareAction,
    onLessonTool: actionsCtrl.handleLessonToolAction,
    onRetry: actionsCtrl.retryLastResponse,
  });

  bindSidebarEvents({
    menuBtn,
    sidebar,
    backdrop,
    newChatBtn,
    onNewChat: sessionCtrl.startNewChat,
  });

  if (chatSearch) {
    chatSearch.addEventListener("input", function () {
      sessionCtrl.setSearchQuery(chatSearch.value || "");
    });

    chatSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        chatSearch.value = "";
        sessionCtrl.setSearchQuery("");
        chatSearch.blur();
      }
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (actionsCtrl.isGenerating()) {
      actionsCtrl.stopGenerating();
      return;
    }

    actionsCtrl.sendMessage();
  });

  input.addEventListener("input", function () {
    autoResizeInput(input);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      if (input.tagName === "TEXTAREA") {
        event.preventDefault();
        if (!actionsCtrl.isGenerating()) {
          actionsCtrl.sendMessage();
        }
      }
    }
  });
});
