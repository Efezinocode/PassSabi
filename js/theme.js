// js/theme.js
// Shared across every page so a theme choice made once on settings.html
// actually sticks everywhere, instead of settings.html just displaying
// static text with no effect.

const THEME_KEY = "passsabi_theme";

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme) {
  const safeTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = safeTheme;
  return safeTheme;
}

export function setTheme(theme) {
  const safeTheme = applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, safeTheme);
  } catch {
    // ignore
  }
  return safeTheme;
}

// Apply the saved preference as soon as this module runs.
applyTheme(getTheme());