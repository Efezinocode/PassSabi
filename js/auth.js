// js/auth.js
import { supabase } from "./supabase.js";

const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const RESET_PAGE = "reset-password.html";
const USER_CHAT_PAGE = "user-chat.html";

const REMEMBER_ME_KEY = "passsabi_remember_me";

const $ = (id) => document.getElementById(id);

let authReadyPromise = null;
let authSubscription = null;
let bootstrapped = false;
let authSession = null;
let authUser = null;

function pageName() {
  return (window.location.pathname.split("/").pop() || "").toLowerCase();
}

function isAuthPage() {
  return [LOGIN_PAGE, SIGNUP_PAGE, FORGOT_PAGE, RESET_PAGE].includes(pageName());
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
    fullName:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.fullName ||
      "",
  };
}

function emitAuthChanged(session, user) {
  window.dispatchEvent(
    new CustomEvent("passsabi:auth-changed", {
      detail: { session: session || null, user: user || null },
    })
  );
}

function persistAuthState(session) {
  authSession = session && typeof session === "object" ? session : null;
  authUser = authSession?.user ? toCachedUser(authSession.user) : null;

  window.__passsabiAuthSession = authSession;
  window.__passsabiAuthUser = authUser;

  emitAuthChanged(authSession, authUser);
  return { session: authSession, user: authUser };
}

async function readSessionFromSupabase() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;

    const session = data?.session || null;
    if (!session) return null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) return { ...session, user: userData.user };
    } catch {}

    return session;
  } catch {
    return null;
  }
}

async function ensureAuthReady() {
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    const session = await readSessionFromSupabase();
    persistAuthState(session);

    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        persistAuthState(nextSession || null);
      });
      authSubscription = data?.subscription || null;
    }

    return session;
  })();

  return authReadyPromise;
}

function currentUser() {
  return authUser || window.__passsabiAuthUser || null;
}

function getAuthSession() {
  return authSession || window.__passsabiAuthSession || null;
}

function isLoggedIn() {
  return !!currentUser();
}

async function syncAuthState() {
  await ensureAuthReady();
  return currentUser();
}

async function clearSession(redirectTo = null) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("Supabase sign out failed:", error);
  }

  try {
    localStorage.removeItem("passsabi_session_v1");
    localStorage.removeItem("passsabi_user_v1");
    localStorage.removeItem(REMEMBER_ME_KEY);
  } catch {}

  authSession = null;
  authUser = null;
  window.__passsabiAuthSession = null;
  window.__passsabiAuthUser = null;
  emitAuthChanged(null, null);

  if (redirectTo) window.location.replace(redirectTo);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function getNextUrl(defaultUrl = USER_CHAT_PAGE) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return defaultUrl;
  if (/^https?:\/\//i.test(next)) return defaultUrl;
  return next.trim() || defaultUrl;
}

function getRedirectUrl(path) {
  return new URL(path, window.location.href).toString();
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

function bindPasswordToggleButtons() {
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = targetId ? $(targetId) : null;
      if (!input) return;

      input.type = input.type === "password" ? "text" : "password";
      btn.textContent = input.type === "password" ? "Show" : "Hide";
    });
  });
}

async function redirectIfAlreadyLoggedIn() {
  if (!isAuthPage()) return false;
  const user = await syncAuthState();
  if (!user) return false;

  window.location.replace(getNextUrl(USER_CHAT_PAGE));
  return true;
}

async function initLogin() {
  const form = $("loginForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("loginNotice");
  const btn = $("loginBtn");
  const params = new URLSearchParams(window.location.search);

  if (params.get("message")) showNotice(notice, params.get("message"), "success");
  if (params.get("email") && $("loginEmail")) $("loginEmail").value = params.get("email");

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
      return;
    }

    persistAuthState(data?.session || null);

    try {
      if (rememberMe) localStorage.setItem(REMEMBER_ME_KEY, "true");
      else localStorage.removeItem(REMEMBER_ME_KEY);
    } catch {}

    window.location.replace(getNextUrl(USER_CHAT_PAGE));
  });
}

async function initSignup() {
  const form = $("signupForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("signupNotice");
  const btn = $("signupBtn");

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

    persistAuthState(data?.session || null);

    if (data?.session) {
      window.location.replace(getNextUrl(USER_CHAT_PAGE));
      return;
    }

    showNotice(notice, "Account created. Check your email to verify your account.", "success");
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
    setTimeout(() => window.location.replace(LOGIN_PAGE), 900);
  });
}

async function bootstrapAuth() {
  await ensureAuthReady();

  bindPasswordToggleButtons();

  if (await redirectIfAlreadyLoggedIn()) return;

  if (pageName() === LOGIN_PAGE) initLogin();
  if (pageName() === SIGNUP_PAGE) initSignup();
  if (pageName() === FORGOT_PAGE) initForgotPassword();
  if (pageName() === RESET_PAGE) initResetPassword();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (bootstrapped) return;
  bootstrapped = true;
  await bootstrapAuth();
});

window.addEventListener("pageshow", async () => {
  await ensureAuthReady();
});

ensureAuthReady().catch((error) => {
  console.warn("Auth bootstrap failed:", error);
});

export {
  currentUser,
  getAuthSession,
  isLoggedIn,
  syncAuthState,
  clearSession,
};
