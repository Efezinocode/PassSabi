// js/auth.js
import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const PROFILE_PAGE = "profile.html";
const RESET_PAGE = "reset-password.html";

const AUTH_SESSION_KEY = "passsabi_session_v1";
const AUTH_USER_KEY = "passsabi_user_v1";
const REMEMBER_ME_KEY = "passsabi_remember_me";

let authReadyPromise = null;
let authSubscription = null;

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
      detail: {
        session: session || null,
        user: user || null,
      },
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

function getNextUrl(defaultUrl = "user-chat.html") {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return defaultUrl;

  const safeNext = next.trim();
  if (!safeNext) return defaultUrl;
  if (/^https?:\/\//i.test(safeNext)) return defaultUrl;
  return safeNext;
}

function getRedirectUrl(path) {
  return new URL(path, window.location.origin).toString();
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

async function requireAuth(redirectTo = `${LOGIN_PAGE}?next=${encodeURIComponent(PROFILE_PAGE)}`) {
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

function renderAuthHeader() {
  const user = currentUser();

  document.querySelectorAll("[data-auth-label]").forEach((node) => {
    node.textContent = user ? (user.fullName || user.email || "User") : "Guest";
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
      await clearSession(
        `${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`
      );
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");
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
    window.location.replace(getNextUrl("user-chat.html"));
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

    const redirectTo = getRedirectUrl(`${RESET_PAGE}?source=signup`);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: fullName,
        },
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
      window.location.replace(getNextUrl("user-chat.html"));
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
  const form = $("forgotForm");
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
  const form = $("resetForm");
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

    const password = $("resetPassword")?.value || "";
    const confirm = $("resetConfirmPassword")?.value || "";

    if (password.length < 8) {
      showNotice(notice, "Password must be at least 8 characters.", "error");
      return;
    }

    if (password !== confirm) {
      showNotice(notice, "Passwords do not match.", "error");
      return;
    }

    setBusy(btn, true, "Updating password...");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setBusy(btn, false);

    if (error) {
      showNotice(notice, error.message, "error");
      return;
    }

    showNotice(notice, "Password updated. Redirecting to login...", "success");
    setTimeout(() => {
      window.location.replace(LOGIN_PAGE);
    }, 1000);
  });
}

async function initProfile() {
  const user = await requireAuth();
  if (!user) return;

  const form = $("profileForm");
  const notice = $("profileNotice");
  const btn = $("profileBtn");

  const profileName = $("profileName");
  const profileEmail = $("profileEmail");
  const profileInitials = $("profileInitials");
  const profilePlan = $("profilePlan");
  const profileCoins = $("profileCoins");

  const name = user.fullName || user.user_metadata?.full_name || user.email || "User";

  if (profileName) profileName.value = name;
  if (profileEmail) profileEmail.value = user.email || "";
  if (profileInitials) profileInitials.textContent = getInitials(name);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("plan,coins,avatar_url,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profilePlan) profilePlan.textContent = profileRow?.plan || "free";
  if (profileCoins) profileCoins.textContent = String(profileRow?.coins ?? 0);

  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotice(notice);

    const newName = profileName?.value?.trim() || "";
    const avatarUrl = $("profileAvatarUrl")?.value?.trim() || "";

    setBusy(btn, true, "Saving...");

    const updates = {
      data: {
        full_name: newName,
      },
    };

    const { error: authError } = await supabase.auth.updateUser(updates);
    if (authError) {
      setBusy(btn, false);
      showNotice(notice, authError.message, "error");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: newName,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setBusy(btn, false);

    if (profileError) {
      showNotice(notice, profileError.message, "error");
      return;
    }

    const nextSession = getAuthSession();
    if (nextSession?.user) {
      cacheAuthState({
        ...nextSession,
        user: {
          ...nextSession.user,
          user_metadata: {
            ...(nextSession.user.user_metadata || {}),
            full_name: newName,
          },
        },
      });
    }

    showNotice(notice, "Profile updated.", "success");
  });
}

async function redirectIfAlreadyLoggedIn() {
  const path = window.location.pathname.split("/").pop() || "";
  const authPages = [LOGIN_PAGE, SIGNUP_PAGE, FORGOT_PAGE];
  if (!authPages.includes(path)) return false;

  await ensureAuthReady();

  const user = currentUser();
  if (user) {
    const next = getNextUrl("user-chat.html");
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
      await clearSession(
        `${LOGIN_PAGE}?message=${encodeURIComponent("You have been logged out.")}`
      );
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
  await ensureAuthReady();
  if (await redirectIfAlreadyLoggedIn()) return;
  initAuthPages();
});

window.addEventListener("pageshow", async () => {
  await ensureAuthReady();
  renderAuthHeader();
  wireGenericAuthButtons();
});

ensureAuthReady().catch((error) => {
  console.warn("Auth bootstrap failed:", error);
});