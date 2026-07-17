// js/user-shell.js
import { currentUser, clearSession, syncAuthState } from "./auth.js";

function goBackSafely() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.replace("index.html");
  }
}

function wireBackButtons() {
  document.querySelectorAll("[data-back-button]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goBackSafely();
    });
  });
}

function wireLogoutButtons() {
  document.querySelectorAll("[data-shell-logout]").forEach((link) => {
    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await clearSession("guest-chat.html");
      window.location.replace("guest-chat.html");
    });
  });
}

function wireUserLinks(user) {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = false;
    link.textContent = user.fullName || user.email || "Profile";
    link.href = "profile.html";
  });
}

function wireGuestLinks() {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = true;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await syncAuthState();

  const user = currentUser();
  wireBackButtons();

  if (!user) {
    wireGuestLinks();
    window.location.replace("guest-chat.html");
    return;
  }

  wireUserLinks(user);
  wireLogoutButtons();
});

window.addEventListener("pageshow", async () => {
  await syncAuthState();

  const user = currentUser();
  wireBackButtons();

  if (!user) {
    wireGuestLinks();
    return;
  }

  wireUserLinks(user);
  wireLogoutButtons();
});