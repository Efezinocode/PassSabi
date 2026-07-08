// js/sidebar.js

export function openSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar || !backdrop || !menuBtn) return;

  sidebar.classList.add("open");
  backdrop.classList.add("show");
  sidebar.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-open");
}

export function closeSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar || !backdrop || !menuBtn) return;

  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
  sidebar.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-open");
}

export function toggleSidebar(sidebar, backdrop, menuBtn) {
  if (!sidebar) return;

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
} = {}) {
  if (menuBtn && sidebar && backdrop) {
    menuBtn.addEventListener("click", function () {
      toggleSidebar(sidebar, backdrop, menuBtn);
    });

    backdrop.addEventListener("click", function () {
      closeSidebar(sidebar, backdrop, menuBtn);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSidebar(sidebar, backdrop, menuBtn);
      }
    });
  }

  if (newChatBtn && typeof onNewChat === "function") {
    newChatBtn.addEventListener("click", function () {
      onNewChat();
    });
  }
}
