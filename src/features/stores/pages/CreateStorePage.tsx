import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { storeRepository } from '../../../services/repositories/supabaseRepositories';

export function CreateStorePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const store = await storeRepository.create({ name, slug, currency });
      navigate('/dashboard', { replace: true, state: { storeId: store.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء المتجر.');
    } finally { setLoading(false); }
  }

  return <div className="container-shell flex min-h-[65vh] items-center justify-center py-12">
    <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border bg-white p-8">
      <h1 className="text-2xl font-bold">أنشئ متجرك</h1>
      <p className="mt-3 text-sm text-slate-500">سيتم إنشاء متجر جديد وربطه بحسابك كمالك.</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label htmlFor="store-name" className="mt-6 block text-sm font-medium">اسم المتجر</label>
      <input id="store-name" required maxLength={100} value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} className="mt-2 w-full rounded-xl border p-3" />
      <label htmlFor="store-slug" className="mt-4 block text-sm font-medium">رابط المتجر (بالإنجليزية)</label>
      <input id="store-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} className="mt-2 w-full rounded-xl border p-3" placeholder="my-store" />
      <label htmlFor="store-currency" className="mt-4 block text-sm font-medium">العملة</label>
      <select id="store-currency" value={currency} onChange={e => setCurrency(e.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="EGP">جنيه مصري (EGP)</option><option value="SAR">ريال سعودي (SAR)</option><option value="AED">درهم إماراتي (AED)</option><option value="USD">دولار أمريكي (USD)</option></select>
      <button disabled={loading} className="btn-primary mt-6 w-full disabled:opacity-60">{loading ? 'جارٍ إنشاء المتجر...' : 'إنشاء المتجر'}</button>
      <Link to="/dashboard" className="mt-5 block text-center text-sm text-slate-500">العودة للوحة التحكم</Link>
    </form>
  </div>;
}
