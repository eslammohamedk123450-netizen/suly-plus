import type { Customer, Order, PageResult, Product, Store, User } from '../../domain/types';
import type { AuthRepository, CustomerRepository, OrderRepository, ProductRepository, StoreRepository } from './contracts';
import { getSupabase } from '../supabase/client';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function toUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): User {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: String(user.user_metadata?.full_name ?? user.email ?? ''),
  };
}

function toStore(row: any): Store {
  return { id: row.id, ownerId: row.created_by, name: row.name, slug: row.slug, currency: row.currency };
}

function toProduct(row: any): Product {
  const variants = (row.product_variants ?? []).map((v: any) => ({
    id: v.id,
    sku: v.sku ?? '',
    options: v.options ?? {},
    priceMinor: Math.round(Number(v.price) * 100),
    inventoryQuantity: v.stock_quantity ?? 0,
  }));
  if (!variants.length) {
    variants.push({
      id: row.id,
      sku: row.sku ?? '',
      options: {},
      priceMinor: Math.round(Number(row.price) * 100),
      inventoryQuantity: row.stock_quantity ?? 0,
    });
  }
  return {
    id: row.id,
    storeId: row.store_id,
    kind: 'physical',
    name: row.name,
    description: row.description ?? '',
    images: row.images ?? [],
    currency: row.currency,
    status: row.status,
    options: [],
    variants,
  };
}

function toOrder(row: any): Order {
  const status: Order['status'] =
    row.status === 'cancelled' || row.status === 'refunded' ? 'cancelled' :
    row.payment_status === 'paid' ? 'paid' :
    row.status === 'shipped' || row.status === 'delivered' ? 'fulfilled' : 'pending';
  return {
    id: String(row.order_number ?? row.id),
    storeId: row.store_id,
    customerId: row.customer_id ?? '',
    status,
    currency: row.currency,
    lines: (row.order_items ?? []).map((line: any) => ({
      productId: line.product_id ?? '',
      variantId: '',
      name: line.product_name,
      quantity: line.quantity,
      unitPriceMinor: Math.round(Number(line.unit_price) * 100),
    })),
    totalMinor: Math.round(Number(row.total) * 100),
    createdAt: row.created_at,
  };
}

export const authRepository: AuthRepository = {
  async currentUser() {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (error.name === 'AuthSessionMissingError') return null;
      throw error;
    }
    return data.user ? toUser(data.user) : null;
  },
  async signIn(email, password) {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    fail(error);
    if (!data.user) throw new Error('لم يتم إرجاع مستخدم من خدمة المصادقة.');
    return toUser(data.user);
  },
  async signOut() {
    const { error } = await getSupabase().auth.signOut();
    fail(error);
  },
  async signUp(input) {
    const { data, error } = await getSupabase().auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.displayName } },
    });
    fail(error);
    if (!data.user) throw new Error('تعذر إنشاء الحساب.');
    if (!data.session) throw new Error('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده ثم سجّل الدخول.');
    return toUser(data.user);
  },
};

export const storeRepository: StoreRepository = {
  async listForCurrentUser() {
    const { data, error } = await getSupabase()
      .from('store_members')
      .select('store_id, stores!inner(id, created_by, name, slug, currency)')
      .order('created_at', { ascending: false });
    fail(error);
    return (data ?? []).map((row: any) => toStore(row.stores));
  },
  async create(input) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await getSupabase()
      .rpc('create_store', {
        store_name: input.name.trim(),
        store_slug: slug,
        store_currency: input.currency,
      });
    fail(error);
    return toStore(data);
  },
  async getBySlug(slug) {
    const { data, error } = await getSupabase()
      .from('stores')
      .select('id, created_by, name, slug, currency')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    fail(error);
    return data ? toStore(data) : null;
  },
};

export const productRepository: ProductRepository = {
  async list(storeId, page = 1) {
    const from = (page - 1) * 20;
    const { data, error, count } = await getSupabase()
      .from('products')
      .select('*, product_variants(*)', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(from, from + 19);
    fail(error);
    return { items: (data ?? []).map(toProduct), total: count ?? 0, page, pageSize: 20 };
  },
  async get(storeId, productId) {
    const { data, error } = await getSupabase()
      .from('products')
      .select('*, product_variants(*)')
      .eq('store_id', storeId)
      .eq('id', productId)
      .maybeSingle();
    fail(error);
    return data ? toProduct(data) : null;
  },
  async create(storeId, input) {
    const firstVariant = input.variants[0];
    const price = (firstVariant?.priceMinor ?? 0) / 100;
    const { data: product, error } = await getSupabase()
      .from('products')
      .insert({
        store_id: storeId,
        name: input.name,
        slug: input.name.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''),
        description: input.description,
        status: input.status,
        price,
        currency: input.currency,
        stock_quantity: firstVariant?.inventoryQuantity ?? 0,
        sku: firstVariant?.sku || null,
        images: input.images,
      })
      .select('*')
      .single();
    fail(error);
    if (firstVariant) {
      const { error: variantError } = await getSupabase().from('product_variants').insert({
        store_id: storeId,
        product_id: product.id,
        name: input.name,
        sku: firstVariant.sku || null,
        price,
        stock_quantity: firstVariant.inventoryQuantity,
        options: firstVariant.options,
      });
      fail(variantError);
    }
    return toProduct({ ...product, product_variants: firstVariant ? [{
      id: '',
      sku: firstVariant.sku,
      options: firstVariant.options,
      price,
      stock_quantity: firstVariant.inventoryQuantity,
    }] : [] });
  },
};

export const orderRepository: OrderRepository = {
  async list(storeId, page = 1) {
    const from = (page - 1) * 20;
    const { data, error, count } = await getSupabase()
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(from, from + 19);
    fail(error);
    return { items: (data ?? []).map(toOrder), total: count ?? 0, page, pageSize: 20 };
  },
};

export const customerRepository: CustomerRepository = {
  async list(storeId, page = 1) {
    const from = (page - 1) * 20;
    const { data, error, count } = await getSupabase()
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(from, from + 19);
    fail(error);
    const items: Customer[] = (data ?? []).map((row: any) => ({
      id: row.id,
      storeId: row.store_id,
      name: row.full_name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
    }));
    return { items, total: count ?? 0, page, pageSize: 20 };
  },
};
