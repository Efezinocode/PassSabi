import { useState } from 'react';
import { authService } from '../../services/authService';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: any) => {
    e.preventDefault();
    setStatus(null);
    const { data, error } = await authService.resetPassword(email);
    if (error) return setStatus(`Error: ${error.message}`);
    setStatus('If an account exists, you will receive a password reset email.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary text-white">
      <form onSubmit={submit} className="max-w-md w-full p-6 bg-[#0b1220] rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Reset password</h2>
        {status && <div className="mb-3 text-sky-300">{status}</div>}
        <label className="block mb-2">Email</label>
        <input className="w-full mb-3 p-2 rounded bg-[#07101a]" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="w-full py-2 bg-accent text-black rounded">Send reset email</button>
      </form>
    </div>
  );
}
