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