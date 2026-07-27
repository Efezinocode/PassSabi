import { supabase } from "./supabase.js";

const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const RESET_PAGE = "reset-password.html";
const USER_CHAT_PAGE = "user-chat.html";

const AUTH_SESSION_KEYS = ["passsabi_auth_session_v2", "passsabi_session_v1"];
const AUTH_USER_KEYS = ["passsabi_auth_user_v2", "passsabi_user_v1"];

const $ = (id) => document.getElementById(id);

const state = {
  booted: false,
  session: null,
  user: null,
  listenerBound: false,
  initPromise: null,
};

function pageName() {
  return (window.location.pathname.split("/").pop() || "").toLowerCase();
}

function isAuthPage() {
  return [LOGIN_PAGE, SIGNUP_PAGE, FORGOT_PAGE, RESET_PAGE].includes(pageName());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFirstStorage(keys) {
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return null;
}

function writeStorage(keys, value) {
  for (const key of keys) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: String(user.id || "").trim(),
    email: String(user.email || "").trim(),
    phone: String(user.phone || "").trim(),
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

function readCachedAuthState() {
  const rawSession = readFirstStorage(AUTH_SESSION_KEYS);
  const rawUser = readFirstStorage(AUTH_USER_KEYS);

  const session = parseJson(rawSession);
  const cachedUser = parseJson(rawUser);

  if (!session && !cachedUser) return null;

  const user = normalizeUser(session?.user || cachedUser);
  if (!user) return null;

  return {
    session: session
      ? {
          ...session,
          user: session.user || user,
        }
      : { user },
    user,
  };
}

function emitAuthChanged(session, user) {
  window.dispatchEvent(
    new CustomEvent("passsabi:auth-changed", {
      detail: { session: session || null, user: user || null },
    })
  );
}

function setAuthState(session, user = null) {
  if (!session) {
    state.session = null;
    state.user = null;
    window.__passsabiAuthSession = null;
    window.__passsabiAuthUser = null;
    writeStorage(AUTH_SESSION_KEYS, null);
    writeStorage(AUTH_USER_KEYS, null);
    emitAuthChanged(null, null);
    return null;
  }

  const nextUser = normalizeUser(user || session.user);
  state.session = {
    ...session,
    user: session.user || nextUser,
  };
  state.user = nextUser;
  window.__passsabiAuthSession = state.session;
  window.__passsabiAuthUser = state.user;

  writeStorage(AUTH_SESSION_KEYS, JSON.stringify(state.session));
  writeStorage(AUTH_USER_KEYS, JSON.stringify(state.user));
  emitAuthChanged(state.session, state.user);
  return state.user;
}

function currentUser() {
  return state.user || window.__passsabiAuthUser || readCachedAuthState()?.user || null;
}

function getAuthSession() {
  return state.session || window.__passsabiAuthSession || readCachedAuthState()?.session || null;
}

function isLoggedIn() {
  return !!currentUser();
}

async function ensureCodeSessionExchange() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code")) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(url.toString());
  if (error) throw error;

  try {
    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore
  }

  if (data?.session) {
    setAuthState(data.session, data.session.user);
  }

  return data?.session || null;
}

function bindListenerOnce() {
  if (state.listenerBound) return;
  state.listenerBound = true;

  try {
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user) setAuthState(nextSession, nextSession.user);
      else setAuthState(null, null);
    });
  } catch (error) {
    console.warn("Auth listener failed:", error);
  }
}

async function syncAuthState() {
  bindListenerOnce();

  const cached = readCachedAuthState();
  if (cached && !state.session && !state.user) {
    setAuthState(cached.session, cached.user);
  }

  try {
    await ensureCodeSessionExchange();
  } catch (error) {
    console.warn("Auth code exchange failed:", error);
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data?.session) {
      setAuthState(null, null);
      return null;
    }

    let session = data.session;
    let user = session.user || null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) user = userData.user;
    } catch {
      // keep session.user
    }

    setAuthState(session, user);
    return state.user;
  } catch (error) {
    console.warn("syncAuthState failed:", error);

    if (cached) {
      setAuthState(cached.session, cached.user);
      return state.user;
    }

    setAuthState(null, null);
    return null;
  }
}

async function ensureAuthReady() {
  if (!state.initPromise) {
    state.initPromise = syncAuthState().catch((error) => {
      console.warn("Initial auth boot failed:", error);
      return null;
    });
  }
  return state.initPromise;
}

async function waitForAuthUser(timeoutMs = 1400, intervalMs = 80) {
  await ensureAuthReady();
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    const user = currentUser();
    if (user) return user;
    await sleep(intervalMs);
  }

  return currentUser();
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

function bindBackButtons() {
  document.querySelectorAll("[data-back-button]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.history.length > 1) window.history.back();
      else window.location.replace("index.html");
    });
  });
}

function maybeRedirectIfLoggedIn() {
  if (!isAuthPage()) return;
  if (!isLoggedIn()) return;
  window.location.replace(getNextUrl(USER_CHAT_PAGE));
}

async function clearSession(redirectTo = null) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("Sign out failed:", error);
  }

  setAuthState(null, null);
  writeStorage(AUTH_SESSION_KEYS, null);
  writeStorage(AUTH_USER_KEYS, null);

  if (redirectTo) {
    window.location.replace(redirectTo);
  }
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

      setAuthState(data?.session || null, data?.session?.user || null);

      try {
        if (rememberMe) localStorage.setItem("passsabi_remember_me", "true");
        else localStorage.removeItem("passsabi_remember_me");
      } catch {
        // ignore
      }

      await syncAuthState();
      window.location.replace(getNextUrl(USER_CHAT_PAGE));
    } catch (error) {
      showNotice(notice, error?.message || "Login failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
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
    e.stopPropagation();
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            name: fullName,
          },
          emailRedirectTo: getRedirectUrl(
            `${LOGIN_PAGE}?message=${encodeURIComponent("Check your email to verify your account.")}`
          ),
        },
      });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      if (data?.session) {
        setAuthState(data.session, data.session.user || null);
        await syncAuthState();
        window.location.replace(getNextUrl(USER_CHAT_PAGE));
        return;
      }

      showNotice(
        notice,
        "Account created. Check your email to verify your account.",
        "success"
      );

      setTimeout(() => {
        window.location.replace(
          `${LOGIN_PAGE}?email=${encodeURIComponent(email)}&message=${encodeURIComponent(
            "Check your email to verify your account."
          )}`
        );
      }, 1100);
    } catch (error) {
      showNotice(notice, error?.message || "Signup failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
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
    e.stopPropagation();
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

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl(`${RESET_PAGE}?email=${encodeURIComponent(email)}`),
      });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      showNotice(notice, "Password reset link sent. Check your email.", "success");
    } catch (error) {
      showNotice(notice, error?.message || "Reset failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
  });
}

async function initResetPassword() {
  const form = $("resetPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("resetNotice");
  const btn = $("resetBtn");

  await syncAuthState();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
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

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      showNotice(notice, "Password updated. Redirecting to login...", "success");
      setTimeout(() => {
        window.location.replace(LOGIN_PAGE);
      }, 900);
    } catch (error) {
      showNotice(notice, error?.message || "Password update failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
  });
}

async function bootstrap() {
  if (state.booted) return;
  state.booted = true;

  bindPasswordToggles();
  bindBackButtons();

  await ensureAuthReady();
  maybeRedirectIfLoggedIn();

  const name = pageName();

  if (name === LOGIN_PAGE) await initLogin();
  if (name === SIGNUP_PAGE) await initSignup();
  if (name === FORGOT_PAGE) await initForgotPassword();
  if (name === RESET_PAGE) await initResetPassword();

  maybeRedirectIfLoggedIn();
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((error) => {
    console.warn("Auth bootstrap failed:", error);
  });
});

window.addEventListener("pageshow", () => {
  syncAuthState().catch((error) => {
    console.warn("Auth pageshow sync failed:", error);
  });
});

window.PassSabiAuth = {
  currentUser,
  getAuthSession,
  isLoggedIn,
  syncAuthState,
  clearSession,
  waitForAuthUser,
  ensureAuthReady,
};

export {
  currentUser,
  getAuthSession,
  isLoggedIn,
  syncAuthState,
  clearSession,
  waitForAuthUser,
  ensureAuthReady,
};