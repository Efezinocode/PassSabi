import { currentUser, clearSession, syncAuthState } from "./auth.js";

const AUTH_RETRY_COUNT = 3;
const AUTH_RETRY_DELAY_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function goBackSafely() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.replace("index.html");
  }
}

function getLoginUrl() {
  return `login.html?next=${encodeURIComponent("user-chat.html")}`;
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
    });
  });
}

function wireUserLinks(user) {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = false;
    link.textContent = user?.fullName || user?.email || "Profile";
    link.href = "profile.html";
  });
}

function wireGuestLinks() {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    link.hidden = true;
  });
}

function wireTopbarAuth(user) {
  const topbar = document.querySelector(".topbar-auth");
  if (!topbar) return;

  topbar.innerHTML = "";

  if (!user) {
    const loginLink = document.createElement("a");
    loginLink.href = getLoginUrl();
    loginLink.className = "topbar-auth-link";
    loginLink.textContent = "Login";

    const signupLink = document.createElement("a");
    signupLink.href = "signup.html";
    signupLink.className = "topbar-auth-link";
    signupLink.textContent = "Sign up";

    topbar.appendChild(loginLink);
    topbar.appendChild(signupLink);
    return;
  }

  const name = document.createElement("span");
  name.className = "topbar-auth-name";
  name.textContent = user.fullName || user.email || "User";

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "topbar-auth-link";
  logoutBtn.textContent = "Logout";
  logoutBtn.addEventListener("click", async () => {
    await clearSession("guest-chat.html");
  });

  topbar.appendChild(name);
  topbar.appendChild(logoutBtn);
}

async function getStableUser() {
  for (let attempt = 0; attempt < AUTH_RETRY_COUNT; attempt += 1) {
    await syncAuthState();

    const user = currentUser();
    if (user) return user;

    if (attempt < AUTH_RETRY_COUNT - 1) {
      await sleep(AUTH_RETRY_DELAY_MS);
    }
  }

  return currentUser();
}

async function renderShellState(redirectIfMissing = true) {
  wireBackButtons();

  const user = await getStableUser();

  if (!user) {
    wireGuestLinks();
    wireTopbarAuth(null);

    if (redirectIfMissing) {
      window.location.replace(getLoginUrl());
      return null;
    }

    return null;
  }

  wireUserLinks(user);
  wireLogoutButtons();
  wireTopbarAuth(user);

  return user;
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderShellState(true);
});

window.addEventListener("pageshow", async () => {
  await renderShellState(true);
});
