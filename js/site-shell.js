import { currentUser, clearSession } from "./auth.js";

function setShellState() {
  const user = currentUser();

  document.querySelectorAll("[data-shell-user]").forEach((node) => {
    node.textContent = user ? (user.fullName || user.email || "Profile") : "Guest";
  });

  document.querySelectorAll("[data-shell-user-wrap]").forEach((node) => {
    node.hidden = !user;
  });

  document.querySelectorAll("[data-shell-login]").forEach((node) => {
    node.hidden = !!user;
  });

  document.querySelectorAll("[data-shell-signup]").forEach((node) => {
    node.hidden = !!user;
  });

  document.querySelectorAll("[data-shell-profile]").forEach((node) => {
    node.hidden = !user;
    if (user && node.tagName === "A") {
      node.href = "profile.html";
      node.textContent = user.fullName || user.email || "Profile";
    }
  });

  document.querySelectorAll("[data-shell-logout]").forEach((node) => {
    node.hidden = !user;

    if (node.dataset.bound === "true") return;
    node.dataset.bound = "true";

    node.addEventListener("click", (e) => {
      e.preventDefault();
      clearSession();
      window.location.href = "index.html?message=You have been logged out.";
    });
  });
}

document.addEventListener("DOMContentLoaded", setShellState);
