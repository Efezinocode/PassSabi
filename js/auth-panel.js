// js/auth-panel.js

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function openPanel(mode = "login") {
  const panel = qs("#authPanel");
  const title = qs("#authPanelTitle");
  const subtitle = qs("#authPanelSubtitle");
  const footer = qs("#authPanelFooter");
  const continueBtn = qs("#authPanelContinue");
  const emailInput = qs("#authPanelEmail");

  if (!panel || !title || !subtitle || !footer || !continueBtn || !emailInput) return;

  title.textContent = "Log in or sign up";
  subtitle.textContent = "You'll get smarter responses and can upload files, images, and more.";
  continueBtn.dataset.mode = mode;
  continueBtn.textContent = "Continue";
  emailInput.value = "";

  footer.innerHTML =
    mode === "signup"
      ? `Already have an account? <a href="login.html">Log in</a>`
      : `No account? <a href="signup.html">Sign up</a>`;

  panel.classList.add("open");
  panel.hidden = false;

  if (typeof panel.scrollIntoView === "function") {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function closePanel() {
  const panel = qs("#authPanel");
  if (!panel) return;
  panel.classList.remove("open");

  window.setTimeout(() => {
    if (!panel.classList.contains("open")) {
      panel.hidden = true;
    }
  }, 250);
}

function wireTriggers() {
  qsa("[data-open-auth]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openPanel(btn.getAttribute("data-open-auth") || "login");
    });
  });
}

function wireCloseButtons() {
  qsa("[data-auth-close]").forEach((btn) => {
    btn.addEventListener("click", closePanel);
  });
}

function wireContinue() {
  const continueBtn = qs("#authPanelContinue");
  const emailInput = qs("#authPanelEmail");

  if (!continueBtn || !emailInput) return;

  continueBtn.addEventListener("click", () => {
    const mode = continueBtn.dataset.mode || "login";
    const email = emailInput.value.trim();
    const base = mode === "signup" ? "signup.html" : "login.html";

    window.location.href = email
      ? `${base}?email=${encodeURIComponent(email)}`
      : base;
  });
}

function wireProviderButtons() {
  qsa("[data-auth-provider]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const provider = btn.getAttribute("data-auth-provider");
      const base = "login.html";

      window.location.href = `${base}?provider=${encodeURIComponent(provider)}`;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireTriggers();
  wireCloseButtons();
  wireContinue();
  wireProviderButtons();
});

window.PassSabiAuthPanel = {
  openPanel,
  closePanel,
};