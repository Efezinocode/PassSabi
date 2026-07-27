import { currentUser, syncAuthState, clearSession } from "./auth.js";

const AUTH_RETRY_COUNT = 3;
const AUTH_RETRY_DELAY_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getLoginUrl() {
  return `login.html?next=${encodeURIComponent("user-chat.html")}`;
}

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

async function getCurrentUser() {
  try {
    await syncAuthState();
    return currentUser();
  } catch (error) {
    console.warn("getCurrentUser failed:", error);
    return null;
  }
}

async function getStableUser() {
  for (let attempt = 0; attempt < AUTH_RETRY_COUNT; attempt += 1) {
    const user = await getCurrentUser();
    if (user) return user;

    if (attempt < AUTH_RETRY_COUNT - 1) {
      await sleep(AUTH_RETRY_DELAY_MS);
    }
  }

  return null;
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
    link.textContent = user?.user_metadata?.full_name || user?.email || "Profile";
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
  name.textContent = user.user_metadata?.full_name || user.email || "User";

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

function setSidebarOpen(open) {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const menuBtn = document.getElementById("menuBtn");

  if (!sidebar || !backdrop) return;

  sidebar.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
  document.body.classList.toggle("sidebar-open", open);

  sidebar.setAttribute("aria-hidden", String(!open));
  backdrop.setAttribute("aria-hidden", String(!open));

  if (menuBtn) {
    menuBtn.setAttribute("aria-expanded", String(open));
  }
}

function wireSidebarControls() {
  const menuBtn = document.getElementById("menuBtn");
  const backdrop = document.getElementById("backdrop");
  const sidebar = document.getElementById("sidebar");

  if (menuBtn && menuBtn.dataset.bound !== "true") {
    menuBtn.dataset.bound = "true";
    menuBtn.addEventListener("click", () => {
      const isOpen = sidebar?.classList.contains("open");
      setSidebarOpen(!isOpen);
    });
  }

  if (backdrop && backdrop.dataset.bound !== "true") {
    backdrop.dataset.bound = "true";
    backdrop.addEventListener("click", () => setSidebarOpen(false));
  }

  if (sidebar) {
    sidebar.querySelectorAll("a").forEach((link) => {
      if (link.dataset.bound === "true") return;
      link.dataset.bound = "true";

      link.addEventListener("click", () => {
        setSidebarOpen(false);
      });
    });
  }
}

async function renderShellState() {
  wireBackButtons();
  wireSidebarControls();

  const user = await getStableUser();

  if (!user) {
    wireGuestLinks();
    wireTopbarAuth(null);
    window.location.replace(getLoginUrl());
    return null;
  }

  wireUserLinks(user);
  wireLogoutButtons();
  wireTopbarAuth(user);
  return user;
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderShellState();
});

window.addEventListener("pageshow", async () => {
  await renderShellState();
});
