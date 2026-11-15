import type { Category, Customer, Order, OrderStatus, OrderStatusHistory, PageResult, Product, Store, User } from '../../domain/types';
import { apiRequest } from '../api/client';
import type { AuthRepository, CategoryRepository, CustomerRepository, OrderRepository, ProductRepository, StoreRepository } from './contracts';

export const authRepository: AuthRepository = {
  currentUser: () => apiRequest<User | null>('/auth/me'),
  signIn: (email, password) => apiRequest<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signOut: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
  signUp: input => apiRequest<User>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
};

export const storeRepository: StoreRepository = {
  listForCurrentUser: () => apiRequest<Store[]>('/stores'),
  create: input => apiRequest<Store>('/stores', { method: 'POST', body: JSON.stringify(input) }),
  getBySlug: slug => apiRequest<Store | null>(`/public/stores/${encodeURIComponent(slug)}`),
};

export const categoryRepository: CategoryRepository = {
  list: storeId => apiRequest<Category[]>(`/stores/${encodeURIComponent(storeId)}/categories`),
  create: (storeId, input) => apiRequest<Category>(`/stores/${encodeURIComponent(storeId)}/categories`, { method: 'POST', body: JSON.stringify(input) }),
  update: (storeId, categoryId, input) => apiRequest<Category>(`/stores/${encodeURIComponent(storeId)}/categories/${encodeURIComponent(categoryId)}`, { method: 'PUT', body: JSON.stringify(input) }),
  delete: (storeId, categoryId) => apiRequest<void>(`/stores/${encodeURIComponent(storeId)}/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),
};

export const productRepository: ProductRepository = {
  list: (storeId, page = 1) => apiRequest<PageResult<Product>>(`/stores/${encodeURIComponent(storeId)}/products?page=${page}`),
  get: (storeId, productId) => apiRequest<Product | null>(`/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`),
  create: (storeId, input) => apiRequest<Product>(`/stores/${encodeURIComponent(storeId)}/products`, { method: 'POST', body: JSON.stringify(input) }),
  update: (storeId, productId, input) => apiRequest<Product>(`/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`, { method: 'PUT', body: JSON.stringify(input) }),
  updateStatus: (storeId, productId, status) => apiRequest<void>(`/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

export const orderRepository: OrderRepository = {
  list: (storeId, page = 1) => apiRequest<PageResult<Order>>(`/stores/${encodeURIComponent(storeId)}/orders?page=${page}`),
  updateStatus: (storeId, orderId, status: OrderStatus, note = '') => apiRequest<void>(`/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
  listStatusHistory: (storeId, orderId) => apiRequest<OrderStatusHistory[]>(`/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/status-history`),
};

export const customerRepository: CustomerRepository = {
  list: (storeId, page = 1) => apiRequest<PageResult<Customer>>(`/stores/${encodeURIComponent(storeId)}/customers?page=${page}`),
};
