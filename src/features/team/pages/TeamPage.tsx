import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, UserX, ShieldCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Store } from '../../../domain/types';
import { storeRepository } from '../../../services/repositories/supabaseRepositories';
import { teamRepository, type StoreTeam, type TeamRole } from '../teamRepository';

const roleLabels: Record<string, string> = {
  owner: 'مالك المتجر', admin: 'مسؤول', manager: 'مدير', staff: 'موظف',
};
const inviteRoleOptions: TeamRole[] = ['admin', 'manager', 'staff'];
const invitationStatusLabels: Record<string, string> = {
  pending: 'بانتظار تأكيد البريد', accepted: 'مقبولة', revoked: 'ملغاة', expired: 'منتهية',
};
function displayedInvitationStatus(invitation: { status: string; expires_at: string }): string {
  if (invitation.status === 'pending' && Date.parse(invitation.expires_at) <= Date.now()) return 'expired';
  return invitation.status;
}
const auditLabels: Record<string, string> = {
  invited: 'إرسال دعوة', member_added: 'إضافة عضو', invitation_accepted: 'قبول الدعوة',
  role_changed: 'تغيير الدور', member_removed: 'إزالة عضو',
};

export function TeamPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [team, setTeam] = useState<StoreTeam | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('staff');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadTeam(id: string) {
    setLoading(true); setError('');
    try { setTeam(await teamRepository.get(id)); }
    catch (cause) { setTeam(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل الفريق.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (available.length) {
          setStoreId(available[0].id);
          const result = await teamRepository.get(available[0].id);
          if (active) setTeam(result);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل فريق المتجر.');
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id); setTeam(null); setNotice('');
    await loadTeam(id);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const message = await teamRepository.invite(storeId, email.trim(), role);
      setEmail('');
      setNotice(message);
      await loadTeam(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرسال الدعوة.');
    } finally { setBusy(false); }
  }

  async function changeRole(userId: string, nextRole: TeamRole) {
    setBusyMember(userId); setError(''); setNotice('');
    try {
      await teamRepository.updateRole(storeId, userId, nextRole);
      setNotice('تم تحديث دور العضو وتسجيل التغيير.');
      await loadTeam(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث الدور.');
    } finally { setBusyMember(null); }
  }

  async function removeMember(userId: string, memberEmail: string) {
    if (!window.confirm(`إزالة ${memberEmail || 'هذا العضو'} من المتجر؟ سيفقد صلاحية الوصول إلى بيانات المتجر.`)) return;
    setBusyMember(userId); setError(''); setNotice('');
    try {
      await teamRepository.remove(storeId, userId);
      setNotice('تمت إزالة العضو وتسجيل العملية.');
      await loadTeam(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إزالة العضو.');
    } finally { setBusyMember(null); }
  }

  const invitationByUser = new Map((team?.invitations ?? []).map(invitation => [invitation.user_id, invitation]));

  return <>
    <PageHeader title="فريق المتجر" description="أرسل دعوات، وغيّر أدوار الفريق، وأزل صلاحيات الوصول مع سجل لكل إجراء." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="team-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="team-store" value={storeId} onChange={event => void changeStore(event.target.value)} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل فريق المتجر...</div>
      : !stores.length ? <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك.</div>
      : !team ? <div className="rounded-2xl border bg-white p-8 text-center"><ShieldCheck className="mx-auto mb-3 text-slate-400"/><p className="font-semibold">تعذّر فتح إدارة الفريق</p><p className="mt-2 text-sm text-slate-500">إدارة الأعضاء والدعوات متاحة لمالك المتجر فقط.</p></div>
      : <>
        <form onSubmit={invite} className="mb-7 rounded-2xl border bg-white p-5">
          <h2 className="font-bold">دعوة عضو جديد</h2>
          <p className="mt-1 text-sm text-slate-500">سيُرسل رابط الدعوة إلى البريد الإلكتروني. لا يمكن منح دور مالك من هذه الصفحة.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <label className="text-sm font-medium">البريد الإلكتروني
              <input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">الدور
              <select value={role} onChange={event => setRole(event.target.value as TeamRole)} className="mt-2 w-full rounded-xl border bg-white p-3">
                {inviteRoleOptions.map(option => <option key={option} value={option}>{roleLabels[option]}</option>)}
              </select>
            </label>
            <button disabled={busy} className="btn-primary mt-auto inline-flex items-center justify-center gap-2 disabled:opacity-50"><UserPlus size={16}/>{busy ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}</button>
          </div>
        </form>

        <section className="mb-7 overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-bold">أعضاء المتجر</h2><p className="mt-1 text-xs text-slate-500">{team.members.length} عضو</p></div><button type="button" onClick={() => void loadTeam(storeId)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><RefreshCw size={14}/>تحديث</button></div>
          {!team.members.length ? <p className="p-8 text-center text-sm text-slate-500">لا يوجد أعضاء.</p> : <div className="divide-y">
            {team.members.map(member => {
              const invitation = invitationByUser.get(member.user_id);
              return <article key={member.user_id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="font-semibold">{member.full_name || member.email || 'عضو الفريق'}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{member.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{roleLabels[member.role] ?? member.role}</span>
                    {invitation && <span className={invitation.status === 'pending' ? 'rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800' : 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700'}>{invitationStatusLabels[invitation.status] ?? invitation.status}</span>}
                  </div>
                </div>
                {member.role !== 'owner' && <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={`دور ${member.email}`} value={member.role} disabled={busyMember === member.user_id || busyMember !== null}
                    onChange={event => void changeRole(member.user_id, event.target.value as TeamRole)} className="rounded-xl border bg-white px-3 py-2 text-sm">
                    {inviteRoleOptions.map(option => <option key={option} value={option}>{roleLabels[option]}</option>)}
                  </select>
                  <button type="button" aria-label={`إزالة ${member.email}`} disabled={busyMember !== null} onClick={() => void removeMember(member.user_id, member.email)} className="rounded-xl border border-red-200 p-2 text-red-700 disabled:opacity-50"><UserX size={16}/></button>
                </div>}
              </article>;
            })}
          </div>}
        </section>

        <section className="mb-7 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">الدعوات</h2></div>
          {!team.invitations.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد دعوات مسجلة.</p> : <div className="divide-y">{team.invitations.map(invitation => <article key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><b className="text-sm">{invitation.email}</b><p className="mt-1 text-xs text-slate-500">{roleLabels[invitation.role]} · {new Date(invitation.created_at).toLocaleDateString('ar-EG')}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{invitationStatusLabels[displayedInvitationStatus(invitation)] ?? invitation.status}</span></article>)}</div>}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">سجل أنشطة الفريق</h2></div>
          {!team.audit.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد تغييرات مسجلة بعد.</p> : <div className="divide-y">{team.audit.map(item => <article key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{auditLabels[item.action] ?? item.action}</b><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString('ar-EG')}</time></div><p className="mt-1 text-sm text-slate-600">{item.email ?? 'عضو في المتجر'}</p>{item.previous_role && item.new_role && <p className="mt-1 text-xs text-slate-500">{roleLabels[item.previous_role]} ← {roleLabels[item.new_role]}</p>}</article>)}</div>}
        </section>
      </>}
  </>;
}
