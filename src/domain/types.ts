export type ID = string;
export type CurrencyCode = string;
export type ProductKind = 'physical' | 'digital';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface User { id: ID; displayName: string; email: string }
export interface Store { id: ID; ownerId: ID; name: string; slug: string; currency: CurrencyCode }
export interface Category {
  id: ID;
  storeId: ID;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}
export interface ProductOption { id: ID; name: string; values: string[] }
export interface ProductVariant { id: ID; sku: string; options: Record<string, string>; priceMinor: number; inventoryQuantity: number }
export interface Product { id: ID; storeId: ID; categoryId?: ID | null; kind: ProductKind; name: string; description: string; images: string[]; currency: CurrencyCode; status: ProductStatus; options: ProductOption[]; variants: ProductVariant[] }
export interface OrderLine { productId: ID; variantId: ID; name: string; quantity: number; unitPriceMinor: number }
export interface Order {
  id: ID;
  orderNumber: number;
  storeId: ID;
  customerId: ID;
  customerName: string;
  customerPhone?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  shippingAddress: Record<string, unknown>;
  currency: CurrencyCode;
  lines: OrderLine[];
  totalMinor: number;
  subtotalMinor?: number;
  discountMinor?: number;
  shippingMinor?: number;
  taxMinor?: number;
  couponCode?: string | null;
  createdAt: string;
}
export interface OrderStatusHistory {
  id: ID;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  note?: string;
  changedAt: string;
}
export interface Customer { id: ID; storeId: ID; name: string; email?: string; phone?: string }
export interface ApiError { code: string; message: string }
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }