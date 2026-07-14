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

  if (sendBtn) {
    sendBtn.addEventListener("click", function (event) {
      event.preventDefault();

      if (isGenerating) {
        stopGenerating();
        return;
      }

      sendMessage();
    });
  }

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