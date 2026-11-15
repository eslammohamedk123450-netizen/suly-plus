import { getSupabase } from '../../services/supabase/client';

export type TeamRole = 'admin' | 'manager' | 'staff';

export interface TeamMember {
  user_id: string;
  email: string;
  full_name: string;
  role: TeamRole | 'owner';
  created_at: string;
}

export interface TeamInvitation {
  id: string;
  user_id: string;
  email: string;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface TeamAuditItem {
  id: string;
  action: 'invited' | 'member_added' | 'invitation_accepted' | 'role_changed' | 'member_removed';
  email: string | null;
  previous_role: string | null;
  new_role: string | null;
  created_at: string;
}

export interface StoreTeam {
  members: TeamMember[];
  invitations: TeamInvitation[];
  audit: TeamAuditItem[];
}

function messageFor(error: unknown, fallback: string): Error {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (status === 403) return new Error('إدارة الفريق متاحة لمالك المتجر فقط.');
  if (status === 401) return new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  if (status === 422) return new Error('اشتراك المتجر غير نشط أو تم الوصول إلى الحد الأقصى لأعضاء الفريق في الخطة الحالية.');
  if (status === 409) return new Error('الحساب موجود بالفعل في المتجر، أو يحتاج إلى تأكيد بريده الإلكتروني أولًا.');
  if (status === 502 || status === 503) return new Error('تعذر إكمال الدعوة أو تحميل بيانات الفريق. تحقق من إعدادات البريد والاتصال.');
  return new Error(fallback);
}

export const teamRepository = {
  async get(storeId: string): Promise<StoreTeam> {
    const { data, error } = await getSupabase().functions.invoke('manage-store-team', {
      method: 'GET',
      headers: { 'x-store-id': storeId },
    });
    if (error) throw messageFor(error, 'تعذر تحميل فريق المتجر.');
    if (!data?.ok || !Array.isArray(data.members)) throw new Error(data?.error ?? 'تعذر تحميل فريق المتجر.');
    return {
      members: data.members as TeamMember[],
      invitations: Array.isArray(data.invitations) ? data.invitations as TeamInvitation[] : [],
      audit: Array.isArray(data.audit) ? data.audit as TeamAuditItem[] : [],
    };
  },

  async invite(storeId: string, email: string, role: TeamRole): Promise<string> {
    const { data, error } = await getSupabase().functions.invoke('manage-store-team', {
      method: 'POST',
      body: { action: 'invite', store_id: storeId, email, role },
    });
    if (error) throw messageFor(error, 'تعذر إرسال دعوة الفريق.');
    if (!data?.ok) throw new Error(data?.error ?? 'تعذر إرسال دعوة الفريق.');
    return typeof data.message === 'string' ? data.message : 'تم تنفيذ الدعوة.';
  },

  async updateRole(storeId: string, userId: string, role: TeamRole): Promise<void> {
    const { data, error } = await getSupabase().functions.invoke('manage-store-team', {
      method: 'POST',
      body: { action: 'change_role', store_id: storeId, user_id: userId, role },
    });
    if (error) throw messageFor(error, 'تعذر تحديث دور العضو.');
    if (!data?.ok) throw new Error(data?.error ?? 'تعذر تحديث دور العضو.');
  },

  async remove(storeId: string, userId: string): Promise<void> {
    const { data, error } = await getSupabase().functions.invoke('manage-store-team', {
      method: 'POST',
      body: { action: 'remove', store_id: storeId, user_id: userId },
    });
    if (error) throw messageFor(error, 'تعذر إزالة العضو.');
    if (!data?.ok) throw new Error(data?.error ?? 'تعذر إزالة العضو.');
  },
};
