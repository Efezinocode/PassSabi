import { currentUser, clearSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const user = currentUser();

  const topbarAuth = document.getElementById("topbarAuth");
  const topbarAuthLink = document.getElementById("topbarAuthLink");

  const guestLinks = document.querySelectorAll("[data-shell-guestlink]");
  const userLink = document.querySelector("[data-shell-userlink]");
  const logoutLink = document.querySelector("[data-shell-logout]");

  if (user) {
    if (topbarAuth) topbarAuth.hidden = true;

    guestLinks.forEach((link) => {
      link.hidden = true;
    });

    if (userLink) {
      userLink.hidden = false;
      userLink.textContent = "Profile";
      userLink.href = "profile.html";
    }

    if (logoutLink) {
      logoutLink.hidden = false;
      logoutLink.textContent = "Logout";

      if (logoutLink.dataset.bound !== "true") {
        logoutLink.dataset.bound = "true";
        logoutLink.addEventListener("click", (e) => {
          e.preventDefault();
          clearSession();
          window.location.href = "index.html?message=You have been logged out.";
        });
      }
    }
  } else {
    if (topbarAuth) topbarAuth.hidden = false;

    if (topbarAuthLink) {
      topbarAuthLink.textContent = "Login";
      topbarAuthLink.href = "login.html";
    }

    guestLinks.forEach((link) => {
      link.hidden = false;
    });

    if (userLink) {
      userLink.hidden = true;
    }

    if (logoutLink) {
      logoutLink.hidden = true;
    }
  }
});
