import { currentUser, clearSession } from "./auth.js";

function updateAuthState() {
  const user = currentUser();
  const topbarAuthLink = document.getElementById("topbarAuthLink");

  if (topbarAuthLink) {
    if (user) {
      topbarAuthLink.textContent = "Logout";
      topbarAuthLink.href = "#";
      topbarAuthLink.classList.add("is-logout");

      if (topbarAuthLink.dataset.bound !== "true") {
        topbarAuthLink.dataset.bound = "true";
        topbarAuthLink.addEventListener("click", (e) => {
          e.preventDefault();
          clearSession();
          window.location.href = "index.html?message=You have been logged out.";
        });
      }
    } else {
      topbarAuthLink.textContent = "Login";
      topbarAuthLink.href = "login.html";
      topbarAuthLink.classList.remove("is-logout");
      topbarAuthLink.dataset.bound = "false";
    }
  }

  document.querySelectorAll("[data-shell-login]").forEach((node) => {
    node.hidden = !!user;
  });

  document.querySelectorAll("[data-shell-signup]").forEach((node) => {
    node.hidden = !!user;
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

  document.querySelectorAll("[data-shell-profile]").forEach((node) => {
    node.hidden = !user;
    if (user && node.tagName === "A") {
      node.href = "profile.html";
      node.textContent = user.fullName || user.email || "Profile";
    }
  });
}

document.addEventListener("DOMContentLoaded", updateAuthState);
