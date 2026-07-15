// js/auth.js
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const PROFILE_PAGE = "profile.html";
const RESET_PAGE = "reset-password.html";

function showNotice(el, message, type = "info") {
  if (!el) return;
  el.className = `notice show ${type}`;
  el.textContent = message;
}

function clearNotice(el) {
  if (!el) return;
  el.className = "notice";
  el.textContent = "";
}

function setBusy(btn, busy, busyText) {
  if (!btn) return;
  if (!btn.dataset.defaultText) btn.dataset.defaultText = btn.textContent;
  btn.disabled = busy;
  btn.textContent = busy ? busyText : btn.dataset.defaultText;
}

function getNextUrl(defaultUrl = "user-chat.html") {
  const params = new URLSearchParams(window.location.search);
  return params.get("next") || defaultUrl;
}

function getRedirectUrl(path) {
  return new URL(path, window.location.origin).toString();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function getInitials(nameOrEmail) {
  const source = String(nameOrEmail || "P").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${(parts[0][0] || "P")}${(parts[1][0] || "S")}`.toUpperCase();
  }
  return (source.slice(0, 2) || "P").toUpperCase();
}

async function getCurrentAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function requireAuth(redirectTo = `${LOGIN_PAGE}?next=${encodeURIComponent(PROFILE_PAGE)}`) {
  const user = await getCurrentAuthUser();
  if (!user) {
    window.location.replace(redirectTo);
    return null;
  }
  return user;
}

async function renderAuthHeader() {
  const user = await getCurrentAuthUser();

  document.querySelectorAll("[data-auth-label]").forEach((node) => {
    node.textContent = user ? (user.user_metadata?.full_name || user.email || "User") : "Guest";
  });

  document.querySelectorAll("[data-auth-email]").forEach((node) => {
    node.textContent = user?.email || "";
  });

  document.querySelectorAll("[data-auth-login]").forEach((node) => {
    node.hidden = !!user;
  });

  document.querySelectorAll("[data-auth-logout]").forEach((node) => {
    node.hidden = !user;
  });

  document.querySelectorAll("[data-auth-logout]").forEach((node) => {
    if (node.dataset.bound === "true") return;
    node.dataset.bound = "true";
    node.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.replace(`${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`);
    });
  });
}

function bindPasswordToggleButtons() {
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = targetId ? $(targetId) : null;
      if (!input) return;

      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      btn.textContent = nextType === "password" ? "Show" : "Hide";
      btn.setAttribute(
        "aria-label",
        nextType === "password" ? "Show password" : "Hide password"
      );
    });
  });
}

async function initLogin() {
  const form = $("loginForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("loginNotice");
  const btn = $("loginBtn");
  const params = new URLSearchParams(window.location.search);

  if (params.get("message")) {
    showNotice(notice, params.get("message"), "success");
  }
  if (params.get("email") && $("loginEmail")) {
    $("loginEmail").value = params.get("email");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const email = $("loginEmail")?.value?.trim();
    const password = $("loginPassword")?.value || "";
    const rememberMe = !!$("rememberMe")?.checked;

    if (!email || !password) {
      showNotice(notice, "Enter your email and password.", "error");
      return;
    }
    if (!isEmail(email)) {
      showNotice(notice, "Enter a valid email address.", "error");
      return;
    }

    setBusy(btn, true, "Logging in...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setBusy(btn, false);
      showNotice(notice, error.message, "error");
      return;
    }

    // Supabase manages the session; this checkbox is kept for UI compatibility.
    if (rememberMe) {
      localStorage.setItem("passsabi_remember_me", "true");
    } else {
      localStorage.removeItem("passsabi_remember_me");
    }

    showNotice(notice, "Login successful. Redirecting...", "success");
    window.location.replace(getNextUrl("user-chat.html"));
  });
}

async function initSignup() {
  const form = $("signupForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = $("signupNotice");
  const btn = $("signupBtn");
  const params = new URLSearchParams(window.location.search);

  if (params.get("email") && $("signupEmail")) {
    $("signupEmail").value = params.get("email");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const fullName = $("fullName")?.value?.trim();
    const email = $("signupEmail")?.value?.trim();
    const password = $("signupPassword")?.value || "";
    const confirmPassword = $("confirmPassword")?.value || "";
    const termsAccepted = !!$("terms")?.checked;

    if (!fullName || !email || !password || !confirmPassword) {
      showNotice(notice, "Please fill in all fields.", "error");
      return;
    }
    if (!isEmail(email)) {
      showNotice(notice, "Enter a valid email address.", "error");
      return;
    }
    if (password.length < 6) {
      showNotice(notice, "Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showNotice(notice, "Passwords do not match.", "error");
      return;
    }
    if (!termsAccepted) {
      showNotice(notice, "You need to accept the terms.", "error");
      return;
    }

    setBusy(btn, true, "Creating account...");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: getRedirectUrl(LOGIN_PAGE),
      },
    });

    if (error) {
      setBusy(btn, false);
      showNotice(notice, error.message, "error");
      return;
    }

    setBusy(btn, false);

    if (data?.user && data?.session) {
      showNotice(notice, "Account created successfully. Redirecting...", "success");
      window.location.replace(getRedirectUrl(PROFILE_PAGE));
      return;
    }

    showNotice(
      notice,
      "Account created. Check your email to confirm your account.",
      "success"
    );
    window.location.replace(
      `${LOGIN_PAGE}?message=${encodeURIComponent("Account created. Please log in.")}`
    );

    


async function initForgotPassword() {
  const form = $("forgotPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = $("forgotNotice");
  const btn = $("forgotBtn");
  const params = new URLSearchParams(window.location.search);

  if (params.get("email") && $("forgotEmail")) {
    $("forgotEmail").value = params.get("email");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const email = $("forgotEmail")?.value?.trim();
    if (!email) {
      showNotice(notice, "Enter your email address.", "error");
      return;
    }
    if (!isEmail(email)) {
      showNotice(notice, "Enter a valid email address.", "error");
      return;
    }

    setBusy(btn, true, "Sending...");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl(RESET_PAGE),
    });

    if (error) {
      setBusy(btn, false);
      showNotice(notice, error.message, "error");
      return;
    }

    setBusy(btn, false);
    showNotice(notice, "Password reset email sent. Check your inbox.", "success");
  });
}

async function initResetPassword() {
  const form = $("resetPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = true;

  const notice = $("resetNotice");
  const btn = $("resetBtn");

  // Supabase recovery links may arrive with a PASSWORD_RECOVERY event.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY" && notice) {
      showNotice(notice, "Enter your new password below.", "info");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const password = $("newPassword")?.value || "";
    const confirmPassword = $("confirmNewPassword")?.value || "";

    if (!password || !confirmPassword) {
      showNotice(notice, "Fill in both password fields.", "error");
      return;
    }
    if (password.length < 6) {
      showNotice(notice, "Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showNotice(notice, "Passwords do not match.", "error");
      return;
    }

    setBusy(btn, true, "Updating...");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setBusy(btn, false);
      showNotice(notice, error.message, "error");
      return;
    }

    setBusy(btn, false);
    showNotice(notice, "Password updated successfully.", "success");
    window.location.replace(
      `${LOGIN_PAGE}?message=${encodeURIComponent("Password updated. Please log in.")}`
    );
  });
}

async function initProfile() {
  const badge = $("currentUserBadge");
  const currentUserName = $("currentUserName");
  const currentUserEmail = $("currentUserEmail");
  const profileName = $("profileName");
  const profileEmail = $("profileEmail");
  const profileStatus = $("profileStatus");
  const profileJoined = $("profileJoined");
  const logoutBtn = $("logoutBtn");

  const needsProfile =
    badge || currentUserName || currentUserEmail || profileName || profileEmail || profileStatus || profileJoined || logoutBtn;

  if (!needsProfile) return;

  const user = await requireAuth(`${LOGIN_PAGE}?next=${encodeURIComponent(PROFILE_PAGE)}`);
  if (!user) return;

  const fullName = user.user_metadata?.full_name || user.email || "PassSabi User";
  const initials = getInitials(fullName);

  if (badge) badge.textContent = initials;
  if (currentUserName) currentUserName.textContent = fullName;
  if (currentUserEmail) currentUserEmail.textContent = user.email || "";
  if (profileName) profileName.textContent = fullName;
  if (profileEmail) profileEmail.textContent = user.email || "";
  if (profileStatus) profileStatus.textContent = user.email_confirmed_at ? "Verified" : "Not verified";
  if (profileJoined) {
    profileJoined.textContent = new Date(user.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (logoutBtn && logoutBtn.dataset.bound !== "true") {
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace(`${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`);
    });
  }
}

async function redirectIfAlreadyLoggedIn() {
  const path = window.location.pathname.split("/").pop();
  const user = await getCurrentAuthUser();

  const authPages = [LOGIN_PAGE, SIGNUP_PAGE, FORGOT_PAGE];
  if (user && authPages.includes(path)) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "user-chat.html";
    window.location.replace(next);
    return true;
  }

  return false;
}

function wireGenericAuthButtons() {
  document.querySelectorAll("[data-auth-logout]").forEach((node) => {
    if (node.dataset.bound === "true") return;
    node.dataset.bound = "true";
    node.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.replace(`${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`);
    });
  });
}

function initAuthPages() {
  bindPasswordToggleButtons();
  initLogin();
  initSignup();
  initForgotPassword();
  initResetPassword();
  initProfile();
  renderAuthHeader();
  wireGenericAuthButtons();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (await redirectIfAlreadyLoggedIn()) return;
  initAuthPages();
});

window.addEventListener("pageshow", async () => {
  renderAuthHeader();
  wireGenericAuthButtons();
});
