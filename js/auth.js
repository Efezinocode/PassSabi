// js/auth.js
import { supabase } from "./supabase.js";
import { migrateGuestDataToUser } from "./storage.js";

const $ = (id) => document.getElementById(id);

const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const PROFILE_PAGE = "profile.html";
const RESET_PAGE = "reset-password.html";
const SETTINGS_PAGE = "settings.html";
const USER_CHAT_PAGE = "user-chat.html";
const GUEST_CHAT_PAGE = "guest-chat.html";

const AUTH_SESSION_KEY = "passsabi_session_v1";
const AUTH_USER_KEY = "passsabi_user_v1";
const REMEMBER_ME_KEY = "passsabi_remember_me";

let authReadyPromise = null;
let authSubscription = null;
let authBootstrapped = false;
let lastMigratedUserId = "";
let verificationResendLock = false;

function currentPath() {
  return window.location.pathname.split("/").pop() || "";
}

function pageName() {
  return currentPath().toLowerCase();
}

function isAuthPage() {
  const page = pageName();
  return [LOGIN_PAGE, SIGNUP_PAGE, FORGOT_PAGE, RESET_PAGE].includes(page);
}

function isProtectedPage() {
  return [PROFILE_PAGE, SETTINGS_PAGE].includes(pageName());
}

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not write ${key}`, error);
  }
}

function emitAuthChanged(session, user) {
  window.dispatchEvent(
    new CustomEvent("passsabi:auth-changed", {
      detail: { session: session || null, user: user || null },
    })
  );
}

function clearAuthCache() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch (error) {
    console.warn("Could not clear auth cache", error);
  }

  window.__passsabiAuthSession = null;
  window.__passsabiAuthUser = null;
  lastMigratedUserId = "";
  emitAuthChanged(null, null);
}

function toCachedUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: user.id || "",
    email: user.email || "",
    phone: user.phone || "",
    created_at: user.created_at || "",
    updated_at: user.updated_at || "",
    last_sign_in_at: user.last_sign_in_at || "",
    email_confirmed_at: user.email_confirmed_at || "",
    confirmed_at: user.confirmed_at || "",
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {},
    identities: Array.isArray(user.identities) ? user.identities : [],
    aud: user.aud || "",
    role: user.role || "",
    fullName:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.fullName ||
      "",
  };
}

function cacheAuthState(session) {
  const safeSession = session && typeof session === "object" ? session : null;
  const safeUser = safeSession?.user ? toCachedUser(safeSession.user) : null;

  if (safeSession) {
    window.__passsabiAuthSession = safeSession;
    writeJson(AUTH_SESSION_KEY, safeSession);
  } else {
    window.__passsabiAuthSession = null;
    writeJson(AUTH_SESSION_KEY, null);
  }

  if (safeUser) {
    window.__passsabiAuthUser = safeUser;
    writeJson(AUTH_USER_KEY, safeUser);

    if (safeUser.id && lastMigratedUserId !== safeUser.id) {
      lastMigratedUserId = safeUser.id;
      try {
        migrateGuestDataToUser();
      } catch (error) {
        console.warn("Guest migration failed:", error);
      }
    }
  } else if (!safeSession) {
    window.__passsabiAuthUser = null;
    writeJson(AUTH_USER_KEY, null);
  }

  emitAuthChanged(safeSession, safeUser);
  return { session: safeSession, user: safeUser };
}

async function readSessionFromSupabase() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Supabase session read failed:", error);
      return null;
    }

    const session = data?.session || null;
    if (!session) return null;

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!userError && userData?.user) {
        return { ...session, user: userData.user };
      }
    } catch (userError) {
      console.warn("Supabase user read failed:", userError);
    }

    return session;
  } catch (error) {
    console.warn("Supabase session read failed:", error);
    return null;
  }
}

async function ensureAuthReady() {
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    const session = await readSessionFromSupabase();
    cacheAuthState(session);

    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        cacheAuthState(nextSession || null);
      });
      authSubscription = data?.subscription || null;
    }

    return session;
  })();

  return authReadyPromise;
}

function getStoredUser() {
  return window.__passsabiAuthUser || readJson(AUTH_USER_KEY, null) || null;
}

function getStoredSession() {
  return window.__passsabiAuthSession || readJson(AUTH_SESSION_KEY, null) || null;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function getNextUrl(defaultUrl = USER_CHAT_PAGE) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return defaultUrl;

  const safeNext = next.trim();
  if (!safeNext) return defaultUrl;
  if (/^https?:\/\//i.test(safeNext)) return defaultUrl;
  return safeNext;
}

function getRedirectUrl(path) {
  return new URL(path, window.location.href).toString();
}

function getInitials(nameOrEmail) {
  const source = String(nameOrEmail || "P").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${(parts[0][0] || "P")}${(parts[1][0] || "S")}`.toUpperCase();
  }

  return (source.slice(0, 2) || "P").toUpperCase();
}

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

function goBackSafely() {
  if (window.history.length > 1) window.history.back();
  else window.location.replace("index.html");
}

function bindBackButtons() {
  document.querySelectorAll("[data-back-button]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goBackSafely();
    });
  });
}

function renderAuthHeader() {
  const user = currentUser();

  document.querySelectorAll("[data-auth-label]").forEach((node) => {
    node.textContent = user ? (user.fullName || user.email || "User") : "Guest";
  });

  document.querySelectorAll("[data-auth-email]").forEach((node) => {
    node.textContent = user?.email || "";
  });
}

function wireLogoutLinks() {
  document.querySelectorAll("[data-auth-logout], [data-shell-logout]").forEach((node) => {
    if (node.dataset.bound === "true") return;
    node.dataset.bound = "true";

    node.addEventListener("click", async (e) => {
      e.preventDefault();
      await clearSession(`${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`);
      window.location.replace(GUEST_CHAT_PAGE);
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

function isVerificationProblem(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("confirm") ||
    text.includes("verification") ||
    text.includes("not confirmed") ||
    text.includes("email not verified") ||
    text.includes("email link")
  );
}

async function resendVerificationEmail(email, notice) {
  if (verificationResendLock) return;
  verificationResendLock = true;

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getRedirectUrl(LOGIN_PAGE),
      },
    });

    if (error) {
      showNotice(
        notice,
        `I could not resend the verification email: ${error.message}`,
        "error"
      );
      return;
    }

    showNotice(
      notice,
      "A fresh verification email was sent. Check inbox and spam.",
      "success"
    );
  } catch (error) {
    showNotice(
      notice,
      `I could not resend the verification email: ${error?.message || "Unknown error"}`,
      "error"
    );
  } finally {
    verificationResendLock = false;
  }
}

export function currentUser() {
  return getStoredUser();
}

export function getAuthSession() {
  return getStoredSession();
}

export function isLoggedIn() {
  return !!currentUser();
}

export async function syncAuthState() {
  await ensureAuthReady();
  return currentUser();
}

export async function clearSession(redirectTo = null) {
  clearAuthCache();

  try {
    localStorage.removeItem(REMEMBER_ME_KEY);
  } catch {
    // ignore
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("Supabase sign out failed:", error);
  }

  if (redirectTo) {
    window.location.replace(redirectTo);
  }
}

async function requireAuth(
  redirectTo = `${LOGIN_PAGE}?next=${encodeURIComponent(PROFILE_PAGE)}`
) {
  const cached = currentUser();
  if (cached) return cached;

  await ensureAuthReady();
  const user = currentUser();
  if (!user) {
    window.location.replace(redirectTo);
    return null;
  }

  return user;
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");

      if (isVerificationProblem(error.message)) {
        await resendVerificationEmail(email, notice);
      }
      return;
    }

    cacheAuthState(data?.session || null);

    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, "true");
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
    } catch {
      // ignore
    }

    showNotice(notice, "Login successful. Redirecting...", "success");
    window.setTimeout(() => {
      window.location.replace(getNextUrl(USER_CHAT_PAGE));
    }, 100);
  });
}

async function initSignup() {
  const form = $("signupForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

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
    const confirm = $("confirmPassword")?.value || "";

    if (!fullName || !email || !password || !confirm) {
      showNotice(notice, "Fill in all fields.", "error");
      return;
    }

    if (!$("terms")?.checked) {
      showNotice(notice, "Please agree to the terms and privacy policy.", "error");
      return;
    }

    if (!isEmail(email)) {
      showNotice(notice, "Enter a valid email address.", "error");
      return;
    }

    if (password.length < 8) {
      showNotice(notice, "Password must be at least 8 characters.", "error");
      return;
    }

    if (password !== confirm) {
      showNotice(notice, "Passwords do not match.", "error");
      return;
    }

    setBusy(btn, true, "Creating account...");

    const redirectTo = getRedirectUrl(
      `${LOGIN_PAGE}?message=${encodeURIComponent("Check your email to verify your account.")}`
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName },
      },
    });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");
      return;
    }

    cacheAuthState(data?.session || null);

    if (data?.session) {
      showNotice(notice, "Account created. Redirecting...", "success");
      window.location.replace(getNextUrl(USER_CHAT_PAGE));
      return;
    }

    showNotice(
      notice,
      "Account created. Check your email to verify your account.",
      "success"
    );
  });
}

async function initForgotPassword() {
  const form = $("forgotPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("forgotNotice");
  const btn = $("forgotBtn");

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

    setBusy(btn, true, "Sending reset link...");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl(`${RESET_PAGE}?email=${encodeURIComponent(email)}`),
    });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");
      return;
    }

    showNotice(notice, "Password reset link sent. Check your email.", "success");
  });
}

async function initResetPassword() {
  const form = $("resetPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("resetNotice");
  const btn = $("resetBtn");
  const params = new URLSearchParams(window.location.search);

  if (params.get("email") && $("resetEmail")) {
    $("resetEmail").value = params.get("email");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const password = $("newPassword")?.value || "";
    const confirm = $("confirmNewPassword")?.value || "";

    if (password.length < 8) {
      showNotice(notice, "Password must be at least 8 characters.", "error");
      return;
    }

    if (password !== confirm) {
      showNotice(notice, "Passwords do not match.", "error");
      return;
    }

    setBusy(btn, true, "Updating password...");

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");
      return;
    }

    showNotice(notice, "Password updated. Redirecting to login...", "success");
    window.setTimeout(() => {
      window.location.replace(LOGIN_PAGE);
    }, 1000);
  });
}

function formatJoinedDate(user) {
  const raw = user?.created_at || user?.updated_at || "";
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initProfile() {
  const user = currentUser();
  if (!user) return;

  const badge = $("currentUserBadge");
  const name = $("currentUserName");
  const email = $("currentUserEmail");
  const profileName = $("profileName");
  const profileEmail = $("profileEmail");
  const profileStatus = $("profileStatus");
  const profileJoined = $("profileJoined");
  const logoutBtn = $("logoutBtn");

  const displayName = user.fullName || user.user_metadata?.full_name || user.email || "User";
  const displayEmail = user.email || "—";

  if (badge) badge.textContent = getInitials(displayName);
  if (name) name.textContent = displayName;
  if (email) email.textContent = displayEmail;
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = displayEmail;
  if (profileStatus) {
    profileStatus.textContent = user.email_confirmed_at || user.confirmed_at ? "Verified" : "Unverified";
  }
  if (profileJoined) profileJoined.textContent = formatJoinedDate(user);

  if (logoutBtn && logoutBtn.dataset.bound !== "true") {
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", async () => {
      await clearSession(`${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`);
      window.location.replace(GUEST_CHAT_PAGE);
    });
  }
}

function initSettings() {
  const user = currentUser();
  if (!user) return;
}

async function redirectIfAlreadyLoggedIn() {
  if (!isAuthPage()) return false;

  await ensureAuthReady();

  const user = currentUser();
  if (user) {
    window.location.replace(getNextUrl(USER_CHAT_PAGE));
    return true;
  }

  return false;
}

function renderPageState() {
  renderAuthHeader();
  wireLogoutLinks();
  bindBackButtons();
}

async function bootstrapAuth() {
  await ensureAuthReady();

  if (await redirectIfAlreadyLoggedIn()) return;

  renderPageState();

  if (isProtectedPage()) {
    await requireAuth();
    if (pageName() === PROFILE_PAGE) initProfile();
    if (pageName() === SETTINGS_PAGE) initSettings();
    return;
  }

  if (isAuthPage()) {
    bindPasswordToggleButtons();
    initLogin();
    initSignup();
    initForgotPassword();
    initResetPassword();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (authBootstrapped) return;
  authBootstrapped = true;
  await bootstrapAuth();
});

window.addEventListener("pageshow", async () => {
  await ensureAuthReady();
  renderPageState();
});

ensureAuthReady().catch((error) => {
  console.warn("Auth bootstrap failed:", error);
});