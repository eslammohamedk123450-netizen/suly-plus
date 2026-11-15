import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authRepository } from '../../../services/repositories/supabaseRepositories';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authRepository.signIn(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="container-shell flex min-h-[65vh] items-center justify-center py-12">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border bg-white p-8">
      <h1 className="text-center text-2xl font-bold">مرحبًا بعودتك</h1>
      <p className="mt-3 text-center text-sm text-slate-500">سجّل الدخول لإدارة متجرك.</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="mt-6 block text-sm font-medium" htmlFor="login-email">البريد الإلكتروني</label>
      <input id="login-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border p-3" />
      <label className="mt-4 block text-sm font-medium" htmlFor="login-password">كلمة المرور</label>
      <input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border p-3" />
      <button disabled={loading} className="btn-primary mt-6 w-full disabled:opacity-60">{loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}</button>
      <p className="mt-6 text-center text-sm text-slate-500">ليس لديك حساب؟ <Link to="/register" className="font-semibold text-brand-600">إنشاء حساب</Link></p>
    </form>
  </div>;
}
