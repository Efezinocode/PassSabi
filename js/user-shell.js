import { clearSession, syncAuthState, waitForAuthUser } from "./auth.js";

const LOGIN_PAGE = "login.html";
const GUEST_CHAT_PAGE = "guest-chat.html";
const PROTECTED_PAGES = new Set(["user-chat.html"]);

function pageName() {
  return (window.location.pathname.split("/").pop() || "").toLowerCase();
}

function isProtectedPage() {
  return PROTECTED_PAGES.has(pageName());
}

function getLoginUrl(next = pageName()) {
  return `${LOGIN_PAGE}?next=${encodeURIComponent(next || "user-chat.html")}`;
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

function wireLogoutButtons() {
  document.querySelectorAll("[data-shell-logout], #logoutBtn").forEach((link) => {
    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await clearSession(GUEST_CHAT_PAGE);
    });
  });
}

function wireUserLinks(user) {
  document.querySelectorAll("[data-shell-userlink]").forEach((link) => {
    if (!user) {
      link.hidden = true;
      return;
    }

    link.hidden = false;
    link.textContent = user.fullName || user.email || "Profile";
    link.href = "profile.html";
  });
}

function wireTopbarAuth(user) {
  const topbar = document.querySelector(".topbar-auth");
  if (!topbar) return;

  topbar.innerHTML = "";

  if (!user) {
    const loginLink = document.createElement("a");
    loginLink.href = getLoginUrl("user-chat.html");
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
    await clearSession(GUEST_CHAT_PAGE);
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
    sidebar.querySelectorAll("a, button").forEach((item) => {
      if (item.dataset.bound === "true") return;
      item.dataset.bound = "true";

      item.addEventListener("click", () => {
        setSidebarOpen(false);
      });
    });
  }
}

async function renderShellState() {
  wireBackButtons();
  wireSidebarControls();

  await syncAuthState();
  const user = (await waitForAuthUser(900)) || null;

  if (!user && isProtectedPage()) {
    wireUserLinks(null);
    wireTopbarAuth(null);
    window.location.replace(getLoginUrl(pageName()));
    return null;
  }

  if (user) {
    wireUserLinks(user);
    wireLogoutButtons();
    wireTopbarAuth(user);
  } else {
    wireUserLinks(null);
    wireTopbarAuth(null);
  }

  return user;
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderShellState();
});

window.addEventListener("pageshow", async () => {
  await renderShellState();
});