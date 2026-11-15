import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { HomePage } from '../features/marketing/pages/HomePage';
import { FeaturesPage } from '../features/marketing/pages/FeaturesPage';
import { PricingPage } from '../features/marketing/pages/PricingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { CreateStorePage } from '../features/stores/pages/CreateStorePage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { ProductsPage } from '../features/products/pages/ProductsPage';
import { CategoriesPage } from '../features/categories/pages/CategoriesPage';
import { OrdersPage } from '../features/orders/pages/OrdersPage';
import { CustomersPage } from '../features/customers/pages/CustomersPage';
import { InventoryPage } from '../features/inventory/pages/InventoryPage';
import { StoreDesignPage } from '../features/store-design/pages/StoreDesignPage';
import { SettingsPage } from '../features/settings/pages/SettingsPage';
import { StorefrontPage } from '../features/storefront/pages/StorefrontPage';
import { ProductDetailsPage } from '../features/storefront/pages/ProductDetailsPage';
import { CartPage } from '../features/storefront/pages/CartPage';
import { CheckoutPage } from '../features/storefront/pages/CheckoutPage';
import { OrderTrackingPage } from '../features/storefront/pages/OrderTrackingPage';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { AdminPage } from '../features/admin/pages/AdminPage';
import { ReportsPage } from '../features/reports/pages/ReportsPage';

export default function App() {
  return <Routes>
    <Route path="/admin" element={<AdminPage />} />
    <Route element={<PublicLayout />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/create-store" element={<CreateStorePage />} />
    </Route>
    <Route path="/dashboard" element={<DashboardLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="categories" element={<CategoriesPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="design" element={<StoreDesignPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="reports" element={<ReportsPage />} />
    </Route>
    <Route path="/store/:storeSlug" element={<StorefrontPage />} />
    <Route path="/store/:storeSlug/product/:productId" element={<ProductDetailsPage />} />
    <Route path="/store/:storeSlug/cart" element={<CartPage />} />
    <Route path="/store/:storeSlug/checkout" element={<CheckoutPage />} />
    <Route path="/store/:storeSlug/order/:orderNumber" element={<OrderTrackingPage />} />
    <Route path="/404" element={<NotFoundPage />} />
    <Route path="*" element={<Navigate to="/404" replace />} />
  </Routes>;
}
