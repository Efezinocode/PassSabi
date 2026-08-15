import { useState } from 'react';
import { authService } from '../../services/authService';
import { useRouter } from 'next/router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await authService.signIn(email, password);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary text-white">
      <form onSubmit={submit} className="max-w-md w-full p-6 bg-[#0b1220] rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Sign in</h2>
        {error && <div className="mb-3 text-red-400">{error}</div>}
        <label className="block mb-2">Email</label>
        <input className="w-full mb-3 p-2 rounded bg-[#07101a]" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block mb-2">Password</label>
        <input type="password" className="w-full mb-4 p-2 rounded bg-[#07101a]" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={loading} className="w-full py-2 bg-accent text-black rounded">{loading ? 'Signing...' : 'Sign in'}</button>
        <div className="mt-3 text-sm">
          <a href="/auth/forgot" className="text-sky-300">Forgot password?</a>
        </div>
      </form>
    </div>
  );
}
