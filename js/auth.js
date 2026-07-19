import { supabase } from "./supabase.js";

console.log("AUTH.JS LOADED");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM LOADED");

  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      console.log("LOGIN SUBMIT DETECTED");

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log("LOGIN RESULT", data, error);

      if (error) {
        alert(error.message);
        return;
      }

      alert("Login successful");

      window.location.href = "user-chat.html";
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      console.log("SIGNUP SUBMIT DETECTED");

      const fullName = document.getElementById("fullName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      console.log("SIGNUP RESULT", data, error);

      if (error) {
        alert(error.message);
        return;
      }

      alert("Account created. Check your email.");
    });
  }
});
