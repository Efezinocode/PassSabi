let messageActionHandlers = {
  onShare: null,
  onLessonTool: null,
  onRetry: null,
};

export function setMessageActionHandlers(handlers = {}) {
  messageActionHandlers = {
    ...messageActionHandlers,
    ...handlers,
  };
}

export function getMessageActionHandlers() {
  return messageActionHandlers;
}
