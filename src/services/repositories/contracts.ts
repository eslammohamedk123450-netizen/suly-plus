import type { Customer, Order, PageResult, Product, Store, User } from '../../domain/types';

export interface AuthRepository {
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  signUp(input: { displayName: string; email: string; password: string }): Promise<User>;
}

export interface StoreRepository {
  listForCurrentUser(): Promise<Store[]>;
  create(input: Pick<Store, 'name' | 'slug' | 'currency'>): Promise<Store>;
  getBySlug(slug: string): Promise<Store | null>;
}

export interface ProductRepository {
  list(storeId: string, page?: number): Promise<PageResult<Product>>;
  get(storeId: string, productId: string): Promise<Product | null>;
  create(storeId: string, input: Omit<Product, 'id' | 'storeId'>): Promise<Product>;
  update(storeId: string, productId: string, input: Omit<Product, 'id' | 'storeId'>): Promise<Product>;
  updateStatus(storeId: string, productId: string, status: Product['status']): Promise<void>;
}

export interface OrderRepository {
  list(storeId: string, page?: number): Promise<PageResult<Order>>;
}

export interface CustomerRepository {
  list(storeId: string, page?: number): Promise<PageResult<Customer>>;
}
