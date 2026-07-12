// js/auth.js
const USERS_KEY = "passsabi_users_v1";
const SESSION_KEY = "passsabi_session_v1";
const RESET_KEY = "passsabi_reset_v1";

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function qs(id) {
  return document.getElementById(id);
}

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function setNotice(el, message, type = "info") {
  if (!el) return;
  el.className = `notice show ${type}`;
  el.textContent = message;
}

function clearNotice(el) {
  if (!el) return;
  el.className = "notice";
  el.textContent = "";
}

function getUsers() {
  return safeJsonParse(localStorage.getItem(USERS_KEY), []) || [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(Array.isArray(users) ? users : []));
}

function getStoredSession() {
  return (
    safeJsonParse(localStorage.getItem(SESSION_KEY), null) ||
    safeJsonParse(sessionStorage.getItem(SESSION_KEY), null)
  );
}

function saveSession(session, rememberMe = false) {
  const payload = JSON.stringify(session);
  if (rememberMe) {
    localStorage.setItem(SESSION_KEY, payload);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, payload);
    localStorage.removeItem(SESSION_KEY);
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function currentUser() {
  const session = getStoredSession();
  if (!session?.email) return null;

  const users = getUsers();
  return (
    users.find((u) => String(u.email).toLowerCase() === String(session.email).toLowerCase()) || null
  );
}

export function requireAuth(redirectTo = "login.html") {
  const user = currentUser();
  if (!user) {
    window.location.replace(redirectTo);
    return null;
  }
  return user;
}

export function renderAuthHeader() {
  const user = currentUser();

  document.querySelectorAll("[data-auth-label]").forEach((node) => {
    node.textContent = user ? (user.fullName || user.email) : "Guest";
  });

  document.querySelectorAll("[data-auth-email]").forEach((node) => {
    node.textContent = user ? user.email : "";
  });

  document.querySelectorAll("[data-auth-login]").forEach((node) => {
    node.hidden = !!user;
  });

  document.querySelectorAll("[data-auth-logout]").forEach((node) => {
    node.hidden = !user;

    if (node.dataset.bound === "true") return;
    node.dataset.bound = "true";

    node.addEventListener("click", (e) => {
      e.preventDefault();
      clearSession();
      window.location.replace("login.html?message=You have been logged out.");
    });
  });
}

export function login({ email, password, rememberMe = false }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");

  if (!cleanEmail) return { ok: false, message: "Enter your email address." };
  if (!cleanPassword) return { ok: false, message: "Enter your password." };

  const users = getUsers();
  const user = users.find(
    (u) => String(u.email).toLowerCase() === cleanEmail && String(u.password) === cleanPassword
  );

  if (!user) return { ok: false, message: "Incorrect email or password." };

  saveSession(
    {
      email: user.email,
      loginAt: Date.now(),
    },
    rememberMe
  );

  return { ok: true, user };
}

export function signup({ fullName, email, password, confirmPassword, termsAccepted }) {
  const name = String(fullName || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  const cleanConfirm = String(confirmPassword || "");

  if (!name) return { ok: false, message: "Enter your full name." };
  if (!cleanEmail) return { ok: false, message: "Enter your email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (cleanPassword.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }
  if (cleanPassword !== cleanConfirm) {
    return { ok: false, message: "Passwords do not match." };
  }
  if (!termsAccepted) {
    return { ok: false, message: "Please accept the terms and privacy policy." };
  }

  const users = getUsers();
  const exists = users.some((u) => String(u.email).toLowerCase() === cleanEmail);
  if (exists) {
    return { ok: false, message: "An account with this email already exists." };
  }

  users.push({
    id: uid(),
    fullName: name,
    email: cleanEmail,
    password: cleanPassword,
    verified: false,
    createdAt: Date.now(),
  });

  saveUsers(users);
  return { ok: true };
}

export function requestPasswordReset(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return { ok: false, message: "Enter your email address." };

  const users = getUsers();
  const user = users.find((u) => String(u.email).toLowerCase() === cleanEmail);
  if (!user) return { ok: false, message: "No account found with that email." };

  const requests = safeJsonParse(localStorage.getItem(RESET_KEY), []) || [];
  requests.push({
    email: cleanEmail,
    requestedAt: Date.now(),
  });
  localStorage.setItem(RESET_KEY, JSON.stringify(requests));

  return {
    ok: true,
    message: "Reset request saved. Connect this to email delivery later.",
  };
}

function bindPasswordToggleButtons() {
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = targetId ? qs(targetId) : null;
      if (!input) return;

      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      btn.textContent = nextType === "password" ? "Show" : "Hide";
    });
  });
}

function bindLoginForm() {
  const form = qs("loginForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = qs("loginNotice");
  const btn = qs("loginBtn");
  const emailInput = qs("loginEmail");
  const params = new URLSearchParams(window.location.search);

  if (emailInput && params.get("email")) {
    emailInput.value = params.get("email");
  }
  if (params.get("message")) {
    setNotice(notice, params.get("message"), "success");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearNotice(notice);

    const result = login({
      email: qs("loginEmail")?.value,
      password: qs("loginPassword")?.value,
      rememberMe: !!qs("rememberMe")?.checked,
    });

    if (!result.ok) {
      setNotice(notice, result.message, "error");
      return;
    }

    setNotice(notice, "Login successful. Redirecting...", "success");
    if (btn) btn.disabled = true;

    const next = params.get("next") || "user-chat.html";
    window.setTimeout(() => {
      window.location.replace(next);
    }, 700);
  });
}

function bindSignupForm() {
  const form = qs("signupForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = qs("signupNotice");
  const btn = qs("signupBtn");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearNotice(notice);

    const result = signup({
      fullName: qs("fullName")?.value,
      email: qs("signupEmail")?.value,
      password: qs("signupPassword")?.value,
      confirmPassword: qs("confirmPassword")?.value,
      termsAccepted: !!qs("terms")?.checked,
    });

    if (!result.ok) {
      setNotice(notice, result.message, "error");
      return;
    }

    setNotice(notice, "Account created. Redirecting to login...", "success");
    if (btn) btn.disabled = true;

    window.setTimeout(() => {
      window.location.replace(
        `login.html?message=${encodeURIComponent("Account created successfully. Please log in.")}`
      );
    }, 900);
  });
}

function bindForgotPasswordForm() {
  const form = qs("forgotPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = qs("forgotNotice");
  const btn = qs("forgotBtn");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearNotice(notice);

    const result = requestPasswordReset(qs("forgotEmail")?.value);
    if (!result.ok) {
      setNotice(notice, result.message, "error");
      return;
    }

    setNotice(notice, result.message, "success");
    if (btn) btn.disabled = true;
  });
}

function bindProfilePage() {
  const profileName = qs("profileName");
  const profileEmail = qs("profileEmail");
  const profileStatus = qs("profileStatus");
  const profileJoined = qs("profileJoined");
  const logoutBtn = qs("logoutBtn");

  if (!profileName && !profileEmail && !profileStatus && !profileJoined && !logoutBtn) return;

  const user = requireAuth("login.html");
  if (!user) return;

  if (profileName) profileName.textContent = user.fullName || "PassSabi User";
  if (profileEmail) profileEmail.textContent = user.email || "";
  if (profileStatus) profileStatus.textContent = user.verified ? "Verified" : "Not verified";

  if (profileJoined) {
    const joined = new Date(user.createdAt || Date.now());
    profileJoined.textContent = joined.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (logoutBtn && logoutBtn.dataset.bound !== "true") {
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.replace("login.html?message=You have been logged out.");
    });
  }
}

window.PassSabiAuth = {
  currentUser,
  requireAuth,
  login,
  signup,
  requestPasswordReset,
  clearSession,
  renderAuthHeader,
};

document.addEventListener("DOMContentLoaded", () => {
  const loggedInUser = currentUser();

  if (loggedInUser && window.location.pathname.includes("login.html")) {
    window.location.replace("user-chat.html");
    return;
  }

  bindPasswordToggleButtons();
  bindLoginForm();
  bindSignupForm();
  bindForgotPasswordForm();
  bindProfilePage();
  renderAuthHeader();
});
