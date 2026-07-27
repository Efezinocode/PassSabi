// js/auth.js
import { supabase } from "./supabase.js";

const LOGIN_PAGE = "login.html";
const USER_CHAT_PAGE = "user-chat.html";
const REMEMBER_ME_KEY = "passsabi_remember_me";

const $ = (id) => document.getElementById(id);

let authSession = null;
let authUser = null;
let booted = false;

function pageName() {
  return (window.location.pathname.split("/").pop() || "").toLowerCase();
}

function toUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: user.id || "",
    email: user.email || "",
    phone: user.phone || "",
    created_at: user.created_at || "",
    updated_at: user.updated_at || "",
    last_sign_in_at: user.last_sign_in_at || "",
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {},
  };
}

function setBusy(btn, busy, busyText) {
  if (!btn) return;
  if (!btn.dataset.defaultText) btn.dataset.defaultText = btn.textContent;
  btn.disabled = busy;
  btn.textContent = busy ? busyText : btn.dataset.defaultText;
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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

async function loadSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;

    authSession = data?.session || null;
    authUser = authSession?.user ? toUser(authSession.user) : null;

    window.__passsabiAuthSession = authSession;
    window.__passsabiAuthUser = authUser;

    return authUser;
  } catch {
    return null;
  }
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
  return loadSession();
}

async function clearSession(redirectTo = null) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("Sign out failed:", error);
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

  if (redirectTo) window.location.replace(redirectTo);
}

function getNextUrl(defaultUrl = USER_CHAT_PAGE) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return defaultUrl;
  if (/^https?:\/\//i.test(next)) return defaultUrl;
  return next.trim() || defaultUrl;
}

function bindPasswordToggles() {
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
    e.stopPropagation();
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

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      authSession = data?.session || null;
      authUser = authSession?.user ? toUser(authSession.user) : null;
      window.__passsabiAuthSession = authSession;
      window.__passsabiAuthUser = authUser;

      try {
        if (rememberMe) localStorage.setItem(REMEMBER_ME_KEY, "true");
        else localStorage.removeItem(REMEMBER_ME_KEY);
      } catch {}

      window.location.replace(getNextUrl(USER_CHAT_PAGE));
    } catch (error) {
      showNotice(notice, error?.message || "Login failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
  });
}

async function bootstrap() {
  bindPasswordToggles();

  if (pageName() === LOGIN_PAGE) {
    initLogin();
  }

  // Load session quietly, but do not block form binding.
  loadSession().catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  if (booted) return;
  booted = true;
  bootstrap().catch((error) => console.warn("Auth bootstrap failed:", error));
});

window.addEventListener("pageshow", () => {
  loadSession().catch(() => {});
});

export {
  currentUser,
  getAuthSession,
  isLoggedIn,
  syncAuthState,
  clearSession,
};
