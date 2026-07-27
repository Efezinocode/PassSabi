import { currentUser, clearSession, syncAuthState } from "./auth.js";

function wireLogoutButtons() {
  document.querySelectorAll("[data-shell-logout]").forEach((link) => {
    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await clearSession("index.html?message=You have been logged out.");
    });
  });
}

function wireProfileLinks(user) {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    if (!user) return;
    link.hidden = false;
    link.textContent = user.fullName || user.email || "Profile";
    link.href = "profile.html";
  });
}

async function renderShellState() {
  await syncAuthState();
  wireLogoutButtons();
  wireProfileLinks(currentUser());
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderShellState();
});

window.addEventListener("pageshow", async () => {
  await renderShellState();
});
