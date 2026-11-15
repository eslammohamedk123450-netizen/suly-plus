import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authRepository } from '../../../services/repositories/supabaseRepositories';

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setError('كلمة المرور يجب ألا تقل عن 8 أحرف.'); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      await authRepository.signUp({ displayName: name.trim(), email: email.trim(), password });
      navigate('/create-store', { replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر إنشاء الحساب.';
      if (message.includes('راجع بريدك الإلكتروني')) setNotice(message);
      else setError(message);
    } finally { setLoading(false); }
  }

  return <div className="container-shell flex min-h-[65vh] items-center justify-center py-12">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border bg-white p-8">
      <h1 className="text-center text-2xl font-bold">أنشئ حسابك</h1>
      <p className="mt-3 text-center text-sm text-slate-500">ابدأ بإدارة تجارتك من مكان واحد.</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      <label className="mt-6 block text-sm font-medium" htmlFor="register-name">الاسم</label>
      <input id="register-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="name" />
      <label className="mt-4 block text-sm font-medium" htmlFor="register-email">البريد الإلكتروني</label>
      <input id="register-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="email" />
      <label className="mt-4 block text-sm font-medium" htmlFor="register-password">كلمة المرور</label>
      <input id="register-password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="new-password" />
      <button disabled={loading} className="btn-primary mt-6 w-full disabled:opacity-60">{loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء حساب'}</button>
      <p className="mt-6 text-center text-sm text-slate-500">لديك حساب؟ <Link to="/login" className="font-semibold text-brand-600">تسجيل الدخول</Link></p>
    </form>
  </div>;
}
