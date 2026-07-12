// js/site-shell.js

document.addEventListener("DOMContentLoaded", () => {
  const loginLink = document.querySelector(".topbar-login-link");

  // Get logged in user
  const user = JSON.parse(localStorage.getItem("passsabiUser"));

  if (loginLink) {
    if (user) {
      // Logged in
      loginLink.textContent = user.name || "Profile";
      loginLink.href = "profile.html";
    } else {
      // Guest
      loginLink.textContent = "Login";
      loginLink.href = "login.html";
    }
  }

  // Logout button (only if one exists)
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("passsabiUser");
      window.location.href = "login.html";
    });
  }
});
