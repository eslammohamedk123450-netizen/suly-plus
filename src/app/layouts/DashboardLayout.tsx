import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Tags, ShoppingCart, Users, Boxes, Palette, Settings, Store, Bell, LogOut } from 'lucide-react';
import type { User } from '../../domain/types';
import { authRepository } from '../../services/repositories/supabaseRepositories';

const links = [
  ['/dashboard', 'نظرة عامة', LayoutDashboard],
  ['/dashboard/products', 'المنتجات', Package],
  ['/dashboard/categories', 'التصنيفات', Tags],
  ['/dashboard/orders', 'الطلبات', ShoppingCart],
  ['/dashboard/customers', 'العملاء', Users],
  ['/dashboard/inventory', 'المخزون', Boxes],
  ['/dashboard/design', 'تصميم المتجر', Palette],
  ['/dashboard/settings', 'الإعدادات', Settings],
] as const;

export function DashboardLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    authRepository.currentUser()
      .then(value => { if (active) setUser(value); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await authRepository.signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">جارٍ التحقق من الجلسة...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="border-l bg-white p-5">
      <a href="/" className="mb-8 flex items-center gap-2 text-xl font-bold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white"><Store /></span>Suly Plus</a>
      <nav className="space-y-1">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18} />{label}</NavLink>)}</nav>
      <p className="mt-10 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">بيانات متجرك محفوظة في قاعدة بيانات Suly Plus.</p>
    </aside>
    <div className="min-w-0">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <span className="truncate text-sm text-slate-500">{user.displayName || user.email}</span>
        <div className="flex items-center gap-2">
          <button aria-label="الإشعارات" className="rounded-lg p-2 hover:bg-slate-100"><Bell /></button>
          <button onClick={() => void signOut()} disabled={signingOut} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"><LogOut size={16} />{signingOut ? 'جارٍ الخروج...' : 'تسجيل الخروج'}</button>
        </div>
      </header>
      <main className="p-5 lg:p-8"><Outlet /></main>
    </div>
  </div>;
}
