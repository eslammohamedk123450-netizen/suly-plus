import type { Category, Customer, Order, OrderStatus, OrderStatusHistory, Product, Store, User } from '../../domain/types';
import type { AuthRepository, CategoryRepository, CustomerRepository, OrderRepository, ProductRepository, StoreRepository } from './contracts';
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

function toCategory(row: any): Category {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
  };
}

function categorySlug(name: string): string {
  const slug = name.normalize('NFKC').trim().toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return slug || `category-${crypto.randomUUID().slice(0, 8)}`;
}

const CATEGORY_SELECT = 'id, store_id, name, slug, description, sort_order, is_active';
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
    categoryId: row.category_id ?? null,
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
    subtotalMinor: Math.round(Number(row.subtotal ?? row.total) * 100),
    discountMinor: Math.round(Number(row.discount_total ?? 0) * 100),
    shippingMinor: Math.round(Number(row.shipping_total ?? 0) * 100),
    taxMinor: Math.round(Number(row.tax_total ?? 0) * 100),
    couponCode: row.coupon_code ?? null,
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

export const categoryRepository: CategoryRepository = {
  async list(storeId) {
    const { data, error } = await getSupabase()
      .from('categories')
      .select(CATEGORY_SELECT)
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    fail(error);
    return (data ?? []).map(toCategory);
  },
  async create(storeId, input) {
    const { data, error } = await getSupabase()
      .from('categories')
      .insert({
        store_id: storeId,
        name: input.name.trim(),
        slug: categorySlug(input.name),
        description: input.description.trim() || null,
        sort_order: input.sortOrder,
        is_active: input.isActive,
      })
      .select(CATEGORY_SELECT)
      .single();
    fail(error);
    return toCategory(data);
  },
  async update(storeId, categoryId, input) {
    const { data, error } = await getSupabase()
      .from('categories')
      .update({
        name: input.name.trim(),
        slug: categorySlug(input.name),
        description: input.description.trim() || null,
        sort_order: input.sortOrder,
        is_active: input.isActive,
      })
      .eq('store_id', storeId)
      .eq('id', categoryId)
      .select(CATEGORY_SELECT)
      .maybeSingle();
    fail(error);
    if (!data) throw new Error('لم يتم العثور على التصنيف أو لا تملك صلاحية تعديله.');
    return toCategory(data);
  },
  async delete(storeId, categoryId) {
    const { data, error } = await getSupabase()
      .from('categories')
      .delete()
      .eq('store_id', storeId)
      .eq('id', categoryId)
      .select('id')
      .maybeSingle();
    fail(error);
    if (!data) throw new Error('لم يتم العثور على التصنيف أو لا تملك صلاحية حذفه.');
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
    if (createError) {
      if (createError.message.includes('PLAN_LIMIT_PRODUCTS_REACHED')) {
        throw new Error('وصل متجرك إلى الحد الأقصى لعدد المنتجات في خطتك الحالية. راجع الاشتراك أو تواصل مع الدعم.');
      }
      if (createError.message.includes('SUBSCRIPTION_NOT_ACTIVE')) {
        throw new Error('اشتراك المتجر غير نشط، لذلك لا يمكن إضافة منتجات جديدة. راجع الاشتراك أو تواصل مع الدعم.');
      }
      throw new Error(createError.message);
    }
    if (!created?.id) throw new Error('لم يتم إرجاع المنتج الذي تم إنشاؤه.');
    const { data: categorized, error: categoryError } = await getSupabase()
      .from('products')
      .update({ category_id: input.categoryId ?? null })
      .eq('store_id', storeId)
      .eq('id', created.id)
      .select('id')
      .maybeSingle();
    fail(categoryError);
    if (!categorized) throw new Error('تم إنشاء المنتج لكن تعذر ربطه بالتصنيف المحدد.');
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
    const { data: categorized, error: categoryError } = await getSupabase()
      .from('products')
      .update({ category_id: input.categoryId ?? null })
      .eq('store_id', storeId)
      .eq('id', productId)
      .select('id')
      .maybeSingle();
    fail(categoryError);
    if (!categorized) throw new Error('تم تحديث المنتج لكن تعذر حفظ تصنيفه.');
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
  discount_total?: number;
  shipping_total?: number;
  tax_total?: number;
  coupon_code?: string | null;
  total: number;
  created_at: string;
  checkout_url?: string;
}

export interface CheckoutPricingSettings {
  shipping_fee: number;
  free_shipping_threshold: number;
  tax_rate: number;
}

export interface CheckoutMethods {
  cash_on_delivery: boolean;
  paymob: boolean;
  pricing: CheckoutPricingSettings;
}

export interface CheckoutQuote {
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  tax_rate: number;
  total: number;
  coupon_code: string | null;
  currency: string;
}

export interface StoreCoupon {
  id: string;
  store_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  minimum_subtotal: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PublicOrderStatus {
  order_number: number;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  coupon_code: string | null;
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
    if (error || !data?.methods) return {
      cash_on_delivery: true, paymob: false,
      pricing: { shipping_fee: 0, free_shipping_threshold: 0, tax_rate: 0 },
    };
    return {
      cash_on_delivery: data.methods.cash_on_delivery === true,
      paymob: data.methods.paymob === true,
      pricing: {
        shipping_fee: Number(data.pricing?.shipping_fee ?? 0),
        free_shipping_threshold: Number(data.pricing?.free_shipping_threshold ?? 0),
        tax_rate: Number(data.pricing?.tax_rate ?? 0),
      },
    };
  },

  async getCheckoutQuote(storeSlug: string, items: Array<{ product_id: string; quantity: number }>, couponCode?: string): Promise<CheckoutQuote> {
    const { data, error } = await getSupabase().functions.invoke('get-checkout-methods', {
      method: 'POST',
      body: { store_slug: storeSlug, items, coupon_code: couponCode || null },
    });
    if (error) throw new Error('تعذر حساب السعر النهائي من الخادم. حاول تحديث الصفحة.');
    if (!data?.ok || !data?.quote) throw new Error(data?.error ?? 'تعذر حساب سعر الطلب.');
    const quote = data.quote;
    return {
      subtotal: Number(quote.subtotal ?? 0),
      discount_total: Number(quote.discount_total ?? 0),
      shipping_total: Number(quote.shipping_total ?? 0),
      tax_total: Number(quote.tax_total ?? 0),
      tax_rate: Number(quote.tax_rate ?? 0),
      total: Number(quote.total ?? 0),
      coupon_code: quote.coupon_code ?? null,
      currency: String(quote.currency ?? 'EGP'),
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
    coupon_code?: string | null;
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
    const order = data.order;
    return {
      ...order,
      subtotal: Number(order.subtotal ?? 0),
      discount_total: Number(order.discount_total ?? 0),
      shipping_total: Number(order.shipping_total ?? 0),
      tax_total: Number(order.tax_total ?? 0),
      coupon_code: typeof order.coupon_code === 'string' ? order.coupon_code : null,
      total: Number(order.total ?? 0),
    } as PublicOrderStatus;
  },
};


export interface DashboardRecentOrder {
  id: string;
  order_number: number;
  customer_name: string;
  total: number;
  currency: string;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
}

export interface StoreDashboardSummary {
  orders_count: number;
  sales_collected: number;
  products_count: number;
  customers_count: number;
  low_stock_count: number;
  recent_orders: DashboardRecentOrder[];
}

export const dashboardRepository = {
  async getSummary(storeId: string): Promise<StoreDashboardSummary> {
    const { data, error } = await getSupabase().rpc('get_store_dashboard_summary', {
      p_store_id: storeId,
    });
    fail(error);
    if (!data) throw new Error('لا توجد بيانات متاحة لهذا المتجر أو لا تملك صلاحية الوصول إليه.');
    return {
      orders_count: Number(data.orders_count ?? 0),
      sales_collected: Number(data.sales_collected ?? 0),
      products_count: Number(data.products_count ?? 0),
      customers_count: Number(data.customers_count ?? 0),
      low_stock_count: Number(data.low_stock_count ?? 0),
      recent_orders: Array.isArray(data.recent_orders) ? data.recent_orders : [],
    };
  },
};


export const checkoutAdminRepository = {
  async getPricingSettings(storeId: string): Promise<CheckoutPricingSettings> {
    const { data, error } = await getSupabase()
      .from('store_settings')
      .select('settings')
      .eq('store_id', storeId)
      .maybeSingle();
    fail(error);
    const pricing = data?.settings?.checkout_pricing ?? {};
    return {
      shipping_fee: Number(pricing.shipping_fee ?? 0),
      free_shipping_threshold: Number(pricing.free_shipping_threshold ?? 0),
      tax_rate: Number(pricing.tax_rate ?? 0),
    };
  },

  async savePricingSettings(storeId: string, pricing: CheckoutPricingSettings): Promise<void> {
    if (![pricing.shipping_fee, pricing.free_shipping_threshold, pricing.tax_rate].every(Number.isFinite)
      || pricing.shipping_fee < 0 || pricing.free_shipping_threshold < 0
      || pricing.tax_rate < 0 || pricing.tax_rate > 100) {
      throw new Error('تحقق من قيم الشحن والضريبة.');
    }
    const { data: existing, error: readError } = await getSupabase()
      .from('store_settings')
      .select('settings')
      .eq('store_id', storeId)
      .maybeSingle();
    fail(readError);
    const settings = {
      ...(existing?.settings ?? {}),
      checkout_pricing: {
        shipping_fee: Math.round(pricing.shipping_fee * 100) / 100,
        free_shipping_threshold: Math.round(pricing.free_shipping_threshold * 100) / 100,
        tax_rate: Math.round(pricing.tax_rate * 10000) / 10000,
      },
    };
    const { error } = await getSupabase()
      .from('store_settings')
      .upsert({ store_id: storeId, settings, updated_at: new Date().toISOString() }, { onConflict: 'store_id' });
    fail(error);
  },

  async listCoupons(storeId: string): Promise<StoreCoupon[]> {
    const { data, error } = await getSupabase()
      .from('store_coupons')
      .select('id, store_id, code, discount_type, discount_value, minimum_subtotal, max_uses, used_count, starts_at, expires_at, is_active, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    fail(error);
    return (data ?? []).map((row: any) => ({
      ...row,
      discount_value: Number(row.discount_value),
      minimum_subtotal: Number(row.minimum_subtotal),
      max_uses: row.max_uses === null ? null : Number(row.max_uses),
      used_count: Number(row.used_count),
    }));
  },

  async createCoupon(storeId: string, input: {
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    minimum_subtotal: number;
    max_uses: number | null;
    starts_at: string | null;
    expires_at: string | null;
  }): Promise<void> {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error('الكود يجب أن يحتوي على 3 إلى 40 حرفًا أو رقمًا.');
    if (!Number.isFinite(input.discount_value) || input.discount_value <= 0
      || (input.discount_type === 'percentage' && input.discount_value > 100)) {
      throw new Error('قيمة الخصم غير صالحة.');
    }
    if (!Number.isFinite(input.minimum_subtotal) || input.minimum_subtotal < 0) {
      throw new Error('الحد الأدنى للطلب غير صالح.');
    }
    const { error } = await getSupabase().from('store_coupons').insert({
      store_id: storeId,
      code,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      minimum_subtotal: input.minimum_subtotal,
      max_uses: input.max_uses,
      starts_at: input.starts_at,
      expires_at: input.expires_at,
    });
    if (error?.code === '23505') throw new Error('يوجد كوبون بنفس الكود داخل هذا المتجر.');
    fail(error);
  },

  async setCouponActive(storeId: string, couponId: string, active: boolean): Promise<void> {
    const { data, error } = await getSupabase().from('store_coupons')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('store_id', storeId).eq('id', couponId).select('id').maybeSingle();
    fail(error);
    if (!data) throw new Error('لم يتم العثور على الكوبون أو لا تملك صلاحية تعديله.');
  },

  async deleteCoupon(storeId: string, couponId: string): Promise<void> {
    const { data, error } = await getSupabase().from('store_coupons')
      .delete().eq('store_id', storeId).eq('id', couponId).select('id').maybeSingle();
    fail(error);
    if (!data) throw new Error('لم يتم العثور على الكوبون أو لا تملك صلاحية حذفه.');
  },
};
