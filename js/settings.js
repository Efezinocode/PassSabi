import { syncAuthState, waitForAuthUser } from "./auth.js";
import { getTheme, setTheme } from "./theme.js";
import { loadMemory, saveMemory, clearMemory } from "./storage.js";

const $ = (id) => document.getElementById(id);

function showNotice(message, type = "success") {
  const el = $("settingsNotice");
  if (!el) return;
  el.className = `notice show ${type}`;
  el.textContent = message;
}

function highlightThemeButtons(theme) {
  const dark = $("themeDarkBtn");
  const light = $("themeLightBtn");
  if (dark) dark.setAttribute("aria-pressed", String(theme === "dark"));
  if (light) light.setAttribute("aria-pressed", String(theme === "light"));
}

function wireThemeButtons() {
  highlightThemeButtons(getTheme());

  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const theme = setTheme(btn.getAttribute("data-theme-option"));
      highlightThemeButtons(theme);
      showNotice(`Theme set to ${theme === "light" ? "Light" : "Dark"}.`, "success");
    });
  });
}

function wireLanguageSelect() {
  const select = $("languageSelect");
  if (!select || select.dataset.bound === "true") return;
  select.dataset.bound = "true";

  select.value = loadMemory().preferences?.language || "";

  select.addEventListener("change", () => {
    const memory = loadMemory();
    memory.preferences = memory.preferences || {};

    if (select.value) memory.preferences.language = select.value;
    else delete memory.preferences.language;

    saveMemory(memory);
    showNotice("Saved. PassSabi AI will use this from your next message.", "success");
  });
}

function wireResetMemory() {
  const btn = $("resetMemoryBtn");
  if (!btn || btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";

  btn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Reset what PassSabi AI remembers about you (name, school, preferences)? This can't be undone."
    );
    if (!confirmed) return;

    clearMemory();
    const select = $("languageSelect");
    if (select) select.value = "";
    showNotice("AI memory reset.", "success");
  });
}

async function initSettings() {
  wireThemeButtons();

  await syncAuthState().catch(() => {});
  const user = await waitForAuthUser(900);

  const accountPanel = $("accountSettingsPanel");
  const guestNote = $("guestSettingsNote");

  if (user) {
    if (accountPanel) accountPanel.hidden = false;
    if (guestNote) guestNote.hidden = true;
    wireLanguageSelect();
    wireResetMemory();
  } else {
    if (accountPanel) accountPanel.hidden = true;
    if (guestNote) guestNote.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettings();
});