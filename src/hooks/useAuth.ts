import { useEffect, useState } from 'react';
import { authService } from '../services/authService';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    authService.getUser().then((u) => {
      if (!mounted) return;
      setUser(u);
      setLoading(false);
    });

    const sub = authService.onAuthStateChange((event, session) => {
      authService.getUser().then((u) => setUser(u));
    });

    return () => {
      mounted = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
