import type { Customer, Order, OrderStatus, OrderStatusHistory, Product, Store, User } from '../../domain/types';
import type { AuthRepository, CustomerRepository, OrderRepository, ProductRepository, StoreRepository } from './contracts';
import { getSupabase } from '../supabase/client';
import { createProductSlug } from '../../features/products/productSlug';

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

const PRODUCT_SELECT = 'id, store_id, category_id, name, slug, description, sku, status, price, currency, stock_quantity, track_inventory, images, created_at, updated_at, product_variants(*)';

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
  return {
    id: row.id,
    orderNumber: Number(row.order_number),
    storeId: row.store_id,
    customerId: row.customer_id ?? '',
    customerName: row.customer_name ?? '',
    customerPhone: row.customer_phone ?? undefined,
    status: row.status as OrderStatus,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    shippingAddress: row.shipping_address ?? {},
    currency: row.currency,
    lines: (row.order_items ?? []).map((line: any) => ({
      productId: line.product_id ?? '',
      variantId: line.variant_id ?? '',
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
    const supabase = getSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    fail(authError);
    if (!authData.user) return [];
    const { data, error } = await supabase
      .from('store_members')
      .select('store_id, stores!inner(id, created_by, name, slug, currency)')
      .eq('user_id', authData.user.id)
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

async function fetchProduct(storeId: string, productId: string): Promise<Product | null> {
  const { data, error } = await getSupabase()
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('id', productId)
    .maybeSingle();
  fail(error);
  return data ? toProduct(data) : null;
}

export const productRepository: ProductRepository = {
  async list(storeId, page = 1) {
    const from = (page - 1) * 20;
    const { data, error, count } = await getSupabase()
      .from('products')
      .select(PRODUCT_SELECT, { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(from, from + 19);
    fail(error);
    return { items: (data ?? []).map(toProduct), total: count ?? 0, page, pageSize: 20 };
  },
  async get(storeId, productId) {
    return fetchProduct(storeId, productId);
  },
  async create(storeId, input) {
    const firstVariant = input.variants[0];
    const price = (firstVariant?.priceMinor ?? 0) / 100;
    const slug = createProductSlug(input.name, `product-${crypto.randomUUID().slice(0, 8)}`);
    const { data: created, error: createError } = await getSupabase()
      .rpc('create_product', {
        p_store_id: storeId,
        p_name: input.name,
        p_slug: slug,
        p_description: input.description,
        p_status: input.status,
        p_price: price,
        p_currency: input.currency,
        p_stock_quantity: firstVariant?.inventoryQuantity ?? 0,
        p_sku: firstVariant?.sku || null,
        p_images: input.images,
      });
    fail(createError);
    if (!created?.id) throw new Error('لم يتم إرجاع المنتج الذي تم إنشاؤه.');
    const { data, error } = await getSupabase()
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('store_id', storeId)
      .eq('id', created.id)
      .single();
    fail(error);
    return toProduct(data);
  },
  async update(storeId, productId, input) {
    const variant = input.variants[0];
    if (!variant?.id) {
      throw new Error('لا يمكن تعديل هذا المنتج لأنه لا يحتوي على متغير أساسي صالح.');
    }
    const { error } = await getSupabase().rpc('update_product', {
      p_store_id: storeId,
      p_product_id: productId,
      p_variant_id: variant.id,
      p_name: input.name.trim(),
      p_slug: createProductSlug(input.name, `product-${productId.slice(0, 8)}`),
      p_description: input.description,
      p_status: input.status,
      p_price: variant.priceMinor / 100,
      p_stock_quantity: variant.inventoryQuantity,
      p_sku: variant.sku || null,
      p_images: input.images,
    });
    fail(error);
    const updated = await fetchProduct(storeId, productId);
    if (!updated) throw new Error('تم تحديث المنتج لكن تعذر إعادة تحميله.');
    return updated;
  },
  async updateStatus(storeId, productId, status) {
    const { data, error } = await getSupabase()
      .from('products')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('id', productId)
      .select('id')
      .maybeSingle();
    fail(error);
    if (!data) throw new Error('لم يتم العثور على المنتج أو لا تملك صلاحية تعديله.');
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

  async updateStatus(storeId: string, orderId: string, status: OrderStatus, note = ''): Promise<void> {
    const { error } = await getSupabase().rpc('update_order_fulfillment_status', {
      p_store_id: storeId,
      p_order_id: orderId,
      p_new_status: status,
      p_note: note.trim() || null,
    });
    fail(error);
  },

  async listStatusHistory(storeId: string, orderId: string): Promise<OrderStatusHistory[]> {
    const { data, error } = await getSupabase()
      .from('order_status_history')
      .select('id, previous_status, new_status, note, created_at')
      .eq('store_id', storeId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(50);
    fail(error);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      note: row.note ?? undefined,
      changedAt: row.created_at,
    }));
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
export interface InventoryMovement {
  id: string;
  product_id: string;
  quantity_delta: number;
  reason: string;
  created_at: string;
  product_name: string | null;
}

export const inventoryRepository = {
  async listMovements(storeId: string, limit = 20): Promise<InventoryMovement[]> {
    const { data, error } = await getSupabase()
      .from('inventory_movements')
      .select('id, product_id, quantity_delta, reason, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    fail(error);
    const movements = (data ?? []) as Array<Omit<InventoryMovement, 'product_name'>>;
    const productIds = [...new Set(movements.map((movement) => movement.product_id))];
    if (!productIds.length) return [];
    const { data: productRows, error: productError } = await getSupabase()
      .from('products')
      .select('id, name')
      .eq('store_id', storeId)
      .in('id', productIds);
    fail(productError);
    const productNames = new Map<string, string>((productRows ?? []).map((product: { id: string; name: string }): [string, string] => [product.id, product.name]));
    return movements.map((movement) => ({
      ...movement,
      product_name: productNames.get(movement.product_id) ?? null,
    }));
  },

  async adjustStock(storeId: string, productId: string, variantId: string, quantityDelta: number): Promise<void> {
    const { error } = await getSupabase().rpc('adjust_product_stock', {
      p_store_id: storeId,
      p_product_id: productId,
      p_variant_id: variantId,
      p_quantity_delta: quantityDelta,
    });
    fail(error);
  },
};

export interface CheckoutCartProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  stock_quantity: number;
  track_inventory: boolean;
  images: string[];
}

export interface GuestOrderResult {
  order_id: string;
  order_number: number;
  public_token: string;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  subtotal: number;
  total: number;
  created_at: string;
  checkout_url?: string;
}

export interface CheckoutMethods {
  cash_on_delivery: boolean;
  paymob: boolean;
}

export interface PublicOrderStatus {
  order_number: number;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  subtotal: number;
  total: number;
  created_at: string;
  items: Array<{ name: string; quantity: number; total_price: number }>;
}

export const checkoutRepository = {
  async getProducts(storeId: string, productIds: string[]): Promise<CheckoutCartProduct[]> {
    if (!productIds.length) return [];
    const { data, error } = await getSupabase()
      .from('products')
      .select('id, name, description, price, currency, stock_quantity, track_inventory, images, status')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .in('id', productIds);
    fail(error);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      stock_quantity: row.stock_quantity,
      track_inventory: row.track_inventory,
      images: row.images ?? [],
    }));
  },

  async getPaymentMethods(storeSlug: string): Promise<CheckoutMethods> {
    const { data, error } = await getSupabase().functions.invoke('get-checkout-methods', {
      method: 'GET',
      headers: { 'x-store-slug': storeSlug },
    });
    if (error || !data?.methods) return { cash_on_delivery: true, paymob: false };
    return {
      cash_on_delivery: data.methods.cash_on_delivery === true,
      paymob: data.methods.paymob === true,
    };
  },

  async createGuestOrder(input: {
    store_slug: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    shipping_address: { address: string; city: string; governorate: string; postal_code: string };
    items: Array<{ product_id: string; quantity: number }>;
    payment_method: 'cash_on_delivery' | 'paymob';
    notes?: string;
  }): Promise<GuestOrderResult> {
    const { data, error } = await getSupabase().functions.invoke('create-guest-order', { body: input });
    if (error) throw new Error('تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.');
    if (!data?.ok || !data?.order) throw new Error(data?.error ?? 'تعذر إنشاء الطلب.');
    return { ...(data.order as GuestOrderResult), checkout_url: typeof data.checkout_url === 'string' ? data.checkout_url : undefined };
  },

  async getOrderStatus(orderNumber: number, publicToken: string): Promise<PublicOrderStatus> {
    const { data, error } = await getSupabase().functions.invoke('get-order-status', {
      body: { order_number: orderNumber, public_token: publicToken },
    });
    if (error) throw new Error('تعذر تحميل حالة الطلب.');
    if (!data?.ok || !data?.order) throw new Error(data?.error ?? 'لم يتم العثور على الطلب.');
    return data.order as PublicOrderStatus;
  },
};

