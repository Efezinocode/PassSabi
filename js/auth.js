// js/auth.js
const LOGIN_PAGE = "login.html";
const SIGNUP_PAGE = "signup.html";
const FORGOT_PAGE = "forgot-password.html";
const RESET_PAGE = "reset-password.html";
const USER_CHAT_PAGE = "user-chat.html";

const SUPABASE_URL =
  window.__PASSSABI_SUPABASE_URL__ ??
  "https://ryfjziuynqhyfrsqiqmq.supabase.co";

const SUPABASE_ANON_KEY =
  window.__PASSSABI_SUPABASE_ANON_KEY__ ??
  "sb_publishable_Ca_4_AhaSQJX69-M_AsIuQ_rHRcUxVU";

const REMEMBER_ME_KEY = "passsabi_remember_me";

const $ = (selector) => document.getElementById(selector);

const state = {
  booted: false,
  clientPromise: null,
  client: null,
  session: null,
  user: null,
  listenerAttached: false,
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

function toUser(user) {
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

function setAuthState(session) {
  state.session = session && typeof session === "object" ? session : null;
  state.user = state.session?.user ? toUser(state.session.user) : null;

  window.__passsabiAuthSession = state.session;
  window.__passsabiAuthUser = state.user;

  emitAuthChanged(state.session, state.user);
  return { session: state.session, user: state.user };
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      if (existing.dataset.loaded === "true") resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadSupabaseSdk() {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase;
  }

  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase;
  }

  throw new Error("Supabase SDK did not load.");
}

async function getSupabase() {
  if (state.client) return state.client;
  if (state.clientPromise) return state.clientPromise;

  state.clientPromise = (async () => {
    try {
      const mod = await import("./supabase.js");
      if (mod?.supabase?.auth?.getSession) {
        state.client = mod.supabase;
        window.__PASSSABI_SUPABASE_CLIENT__ = state.client;
        return state.client;
      }
    } catch (error) {
      console.warn("Fallbacking to direct Supabase SDK:", error);
    }

    const sdk = await loadSupabaseSdk();
    const client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
      global: {
        headers: {
          "X-Client-Info": "PassSabi-AI-Web",
        },
      },
    });

    state.client = client;
    window.__PASSSABI_SUPABASE_CLIENT__ = client;
    return client;
  })();

  return state.clientPromise;
}

async function syncAuthState() {
  const supabase = await getSupabase();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAuthState(null);
      return null;
    }

    const session = data?.session || null;
    if (!session) {
      setAuthState(null);
      return null;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const merged = { ...session, user: userData.user };
        setAuthState(merged);
        attachAuthListener(supabase);
        return state.user;
      }
    } catch {}

    setAuthState(session);
    attachAuthListener(supabase);
    return state.user;
  } catch (error) {
    console.warn("syncAuthState failed:", error);
    setAuthState(null);
    return null;
  }
}

function attachAuthListener(supabase) {
  if (state.listenerAttached) return;
  state.listenerAttached = true;

  try {
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthState(nextSession || null);
    });
  } catch (error) {
    console.warn("Auth listener failed:", error);
  }
}

function currentUser() {
  return state.user || window.__passsabiAuthUser || null;
}

function getAuthSession() {
  return state.session || window.__passsabiAuthSession || null;
}

function isLoggedIn() {
  return !!currentUser();
}

async function clearSession(redirectTo = null) {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("Sign out failed:", error);
  }

  try {
    localStorage.removeItem("passsabi_session_v1");
    localStorage.removeItem("passsabi_user_v1");
    localStorage.removeItem(REMEMBER_ME_KEY);
  } catch {}

  setAuthState(null);

  if (redirectTo) {
    window.location.replace(redirectTo);
  }
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

function initLogin() {
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
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      setAuthState(data?.session || null);

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

function initSignup() {
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
      const supabase = await getSupabase();
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

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      setAuthState(data?.session || null);

      if (data?.session) {
        window.location.replace(getNextUrl(USER_CHAT_PAGE));
        return;
      }

      showNotice(notice, "Account created. Check your email to verify your account.", "success");
    } catch (error) {
      showNotice(notice, error?.message || "Signup failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
  });
}

function initForgotPassword() {
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
      const supabase = await getSupabase();
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

function initResetPassword() {
  const form = $("resetPasswordForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const notice = $("resetNotice");
  const btn = $("resetBtn");

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
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        showNotice(notice, error.message, "error");
        return;
      }

      showNotice(notice, "Password updated. Redirecting to login...", "success");
      setTimeout(() => window.location.replace(LOGIN_PAGE), 900);
    } catch (error) {
      showNotice(notice, error?.message || "Password update failed. Try again.", "error");
    } finally {
      setBusy(btn, false);
    }
  });
}

async function bootstrap() {
  bindPasswordToggles();
  bindBackButtons();

  const name = pageName();
  if (name === LOGIN_PAGE) initLogin();
  if (name === SIGNUP_PAGE) initSignup();
  if (name === FORGOT_PAGE) initForgotPassword();
  if (name === RESET_PAGE) initResetPassword();

  try {
    await syncAuthState();
    maybeRedirectIfLoggedIn();
  } catch (error) {
    console.warn("Auth bootstrap failed:", error);
  }
}

function start() {
  if (state.booted) return;
  state.booted = true;

  bootstrap().catch((error) => {
    console.warn("Auth startup crashed:", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

window.addEventListener("pageshow", () => {
  syncAuthState().catch((error) => {
    console.warn("Auth pageshow sync failed:", error);
  });
});

export {
  currentUser,
  getAuthSession,
  isLoggedIn,
  syncAuthState,
  clearSession,
  getSupabase,
};
