// js/sidebar.js
export function openSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar || !backdrop || !menuBtn) return;

  sidebar.classList.add("open");
  backdrop.classList.add("show");
  document.body.classList.add("sidebar-open");

  sidebar.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
}

export function closeSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar || !backdrop || !menuBtn) return;

  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
  document.body.classList.remove("sidebar-open");

  sidebar.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
}

export function toggleSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar || !backdrop || !menuBtn) return;

  if (sidebar.classList.contains("open")) {
    closeSidebar(sidebar, backdrop, menuBtn);
  } else {
    openSidebar(sidebar, backdrop, menuBtn);
  }
}

export function bindSidebarEvents({
  menuBtn,
  sidebar,
  backdrop,
  newChatBtn,
  onNewChat,
}) {
  if (!menuBtn || !sidebar || !backdrop) return () => {};

  const handleMenuClick = () => toggleSidebar(sidebar, backdrop, menuBtn);
  const handleBackdropClick = () => closeSidebar(sidebar, backdrop, menuBtn);
  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closeSidebar(sidebar, backdrop, menuBtn);
    }
  };
  const handleNewChat = () => {
    if (typeof onNewChat === "function") onNewChat();
  };

  menuBtn.addEventListener("click", handleMenuClick);
  backdrop.addEventListener("click", handleBackdropClick);
  document.addEventListener("keydown", handleEscape);

  if (newChatBtn) {
    newChatBtn.addEventListener("click", handleNewChat);
  }

  return function cleanup() {
    menuBtn.removeEventListener("click", handleMenuClick);
    backdrop.removeEventListener("click", handleBackdropClick);
    document.removeEventListener("keydown", handleEscape);

    if (newChatBtn) {
      newChatBtn.removeEventListener("click", handleNewChat);
    }
  };
}
