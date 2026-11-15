import { getSupabase } from '../../services/supabase/client';

export interface StoreAppearance {
  id: string;
  name: string;
  slug: string;
  currency: string;
  description: string;
  logoUrl: string;
  announcement: string;
  supportEmail: string;
  supportPhone: string;
}

export type PublicStoreAppearance = Pick<StoreAppearance, 'id'|'name'|'slug'|'currency'|'description'|'logoUrl'|'announcement'|'supportEmail'|'supportPhone'>;

function raise(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const storeAppearanceRepository = {
  async getForManager(storeId: string): Promise<StoreAppearance> {
    const supabase = getSupabase();
    const [{ data: store, error: storeError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from('stores').select('id,name,slug,currency,description,logo_url').eq('id', storeId).single(),
      supabase.from('store_settings').select('announcement,support_email,support_phone').eq('store_id', storeId).maybeSingle(),
    ]);
    raise(storeError);
    raise(settingsError);
    if (!store) throw new Error('المتجر غير موجود أو لا تملك صلاحية الوصول إليه.');
    return {
      id: store.id,
      name: store.name ?? '',
      slug: store.slug ?? '',
      currency: store.currency ?? 'EGP',
      description: store.description ?? '',
      logoUrl: store.logo_url ?? '',
      announcement: settings?.announcement ?? '',
      supportEmail: settings?.support_email ?? '',
      supportPhone: settings?.support_phone ?? '',
    };
  },

  async getPublicBySlug(slug: string): Promise<PublicStoreAppearance | null> {
    const { data, error } = await getSupabase()
      .from('stores')
      .select('id,name,slug,currency,description,logo_url')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    raise(error);
    if (!data) return null;
    const { data: publicInfo } = await getSupabase().functions.invoke('get-public-store-info', {
      method: 'GET',
      headers: { 'x-store-slug': slug },
    });
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      currency: data.currency,
      description: data.description ?? '',
      logoUrl: data.logo_url ?? '',
      announcement: typeof publicInfo?.announcement === 'string' ? publicInfo.announcement : '',
      supportEmail: typeof publicInfo?.support_email === 'string' ? publicInfo.support_email : '',
      supportPhone: typeof publicInfo?.support_phone === 'string' ? publicInfo.support_phone : '',
    };
  },

  async save(storeId: string, input: Omit<StoreAppearance, 'id'|'slug'|'currency'>): Promise<void> {
    const name = input.name.trim();
    const description = input.description.trim();
    const logoUrl = input.logoUrl.trim();
    if (name.length < 2 || name.length > 100) throw new Error('اسم المتجر يجب أن يكون بين حرفين و100 حرف.');
    if (description.length > 1000 || input.announcement.length > 240) throw new Error('الوصف أو شريط الإعلان أطول من الحد المسموح.');
    if (input.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.supportEmail)) throw new Error('البريد الإلكتروني للدعم غير صالح.');
    if (input.supportPhone.length > 30) throw new Error('رقم الهاتف أطول من الحد المسموح.');
    if (logoUrl) {
      let parsed: URL;
      try { parsed = new URL(logoUrl); } catch { throw new Error('رابط الشعار غير صالح.'); }
      if (parsed.protocol !== 'https:') throw new Error('يجب أن يبدأ رابط الشعار بـ HTTPS.');
    }
    const { error } = await getSupabase().rpc('update_store_appearance', {
      p_store_id: storeId,
      p_name: name,
      p_description: description || null,
      p_logo_url: logoUrl || null,
      p_announcement: input.announcement.trim() || null,
      p_support_email: input.supportEmail.trim() || null,
      p_support_phone: input.supportPhone.trim() || null,
    });
    raise(error);
  },
};
