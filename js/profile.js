import { clearSession, syncAuthState, waitForAuthUser } from "./auth.js";

const $ = (id) => document.getElementById(id);

function getLoginUrl() {
  return `login.html?next=${encodeURIComponent("profile.html")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderProfile(user) {
  const name = user.fullName || (user.email ? user.email.split("@")[0] : "PassSabi User");
  const initial = (name || "P").trim().charAt(0).toUpperCase() || "P";
  const verified = Boolean(user.email_confirmed_at || user.confirmed_at);

  if ($("currentUserBadge")) $("currentUserBadge").textContent = initial;
  if ($("currentUserName")) $("currentUserName").textContent = name;
  if ($("currentUserEmail")) $("currentUserEmail").textContent = user.email || "";

  if ($("profileName")) $("profileName").textContent = name;
  if ($("profileEmail")) $("profileEmail").textContent = user.email || "—";
  if ($("profileStatus")) $("profileStatus").textContent = verified ? "Verified" : "Pending verification";
  if ($("profileJoined")) $("profileJoined").textContent = formatDate(user.created_at);
}

function wireLogout() {
  const btn = $("logoutBtn");
  if (!btn || btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Logging out...";
    await clearSession("guest-chat.html");
  });
}

async function initProfile() {
  wireLogout();

  await syncAuthState().catch(() => {});
  const user = await waitForAuthUser(1200);

  if (!user) {
    window.location.replace(getLoginUrl());
    return;
  }

  renderProfile(user);
}

document.addEventListener("DOMContentLoaded", () => {
  initProfile();
});

window.addEventListener("pageshow", () => {
  initProfile();
});