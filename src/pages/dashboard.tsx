import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-primary text-white p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm">{user.email}</p>
      </header>

      <section className="space-y-4">
        <div className="p-4 bg-[#07101a] rounded">Continue learning — quick actions</div>
        <div className="p-4 bg-[#07101a] rounded">Recent chats (placeholder)</div>
      </section>
    </div>
  );
}
