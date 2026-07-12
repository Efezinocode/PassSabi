import { currentUser, clearSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = currentUser();

  if (!user) {
    window.location.replace("guest-chat.html");
    return;
  }

  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = false;
    link.textContent = user.fullName || user.email || "Profile";
    link.href = "profile.html";
  });

  document.querySelectorAll("[data-shell-logout]").forEach((link) => {
    link.hidden = false;

    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", (e) => {
      e.preventDefault();
      clearSession();
      window.location.replace("guest-chat.html");
    });
  });

  // Prevent Android back button from leaving the logged-in chat page
  history.pushState(null, "", window.location.href);
  window.addEventListener("popstate", () => {
    history.pushState(null, "", window.location.href);
  });
});
