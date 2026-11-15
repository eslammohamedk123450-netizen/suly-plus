import type { PageResult, Product } from '../../domain/types';
import { getSupabase } from '../../services/supabase/client';

const select = 'id,store_id,category_id,name,description,sku,status,price,currency,stock_quantity,images,product_variants(*)';

export async function listPublicProducts(storeId: string, page = 1): Promise<PageResult<Product>> {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * 20;
  const { data, error, count } = await getSupabase()
    .from('products')
    .select(select, { count: 'exact' })
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, from + 19);
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row: any): Product => {
    const variants = (row.product_variants ?? []).map((variant: any) => ({
      id: variant.id,
      sku: variant.sku ?? '',
      options: variant.options ?? {},
      priceMinor: Math.round(Number(variant.price) * 100),
      inventoryQuantity: variant.stock_quantity ?? 0,
    }));
    if (!variants.length) variants.push({
      id: row.id,
      sku: row.sku ?? '',
      options: {},
      priceMinor: Math.round(Number(row.price) * 100),
      inventoryQuantity: row.stock_quantity ?? 0,
    });
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
  });
  return { items, total: count ?? 0, page: safePage, pageSize: 20 };
}
