// js/user-shell.js
import { currentUser, clearSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = currentUser();

  // If no signed-in user, send them back to the guest chat page
  if (!user) {
    window.location.href = "guest-chat.html";
    return;
  }

  // Sidebar profile link
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = false;
    link.textContent = user.fullName || user.email || "Profile";
    link.href = "profile.html";
  });

  // Logout links
  document.querySelectorAll("[data-shell-logout]").forEach((link) => {
    link.hidden = false;

    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", (e) => {
      e.preventDefault();
      clearSession();
      window.location.href = "guest-chat.html";
    });
  });
});
