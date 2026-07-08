export function isNearBottom(container, threshold = 120) {
  if (!container) return true;

  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;

  return distanceFromBottom <= threshold;
}

export function scrollToBottom(container, smooth = false) {
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function autoScrollIfNeeded(container, threshold = 120, smooth = false) {
  if (isNearBottom(container, threshold)) {
    scrollToBottom(container, smooth);
  }
}

export function autoResizeInput(input) {
  if (!input) return;
  if (input.tagName !== "TEXTAREA") return;

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

export function setSendButtonState(sendBtn, isGenerating) {
  if (!sendBtn) return;

  if (isGenerating) {
    sendBtn.textContent = "■";
    sendBtn.setAttribute("aria-label", "Stop generating");
    sendBtn.title = "Stop generating";
  } else {
    sendBtn.textContent = "➤";
    sendBtn.setAttribute("aria-label", "Send message");
    sendBtn.title = "Send message";
  }
}
