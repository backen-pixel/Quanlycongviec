import { api } from './client';

export type ProductDimensions = {
  ngang?: number | null;
  cao?: number | null;
  sau?: number | null;
};

export type ProductCategory = {
  id: string;
  name: string;
  slug?: string | null;
  is_active?: boolean | null;
  order_index?: number | null;
};

export type ProductRow = {
  id: string;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  selling_price?: number | null;
  base_price?: number | null;
  dimensions?: ProductDimensions | null;
  category_id?: string | null;
  company_id?: string | null;
  category?: { id: string; name?: string | null; slug?: string | null } | null;
};

export type FetchProductsParams = {
  search?: string;
  category_id?: string;
  company_id?: string;
  limit?: number;
  signal?: AbortSignal;
};

export type FetchProductsResult = {
  products: ProductRow[];
  total: number;
};

export async function fetchProducts(params: FetchProductsParams = {}): Promise<FetchProductsResult> {
  const { data } = await api.get<{ products?: ProductRow[]; total?: number }>('/products', {
    params: {
      limit: params.limit ?? 200,
      search: params.search?.trim() || undefined,
      category_id: params.category_id || undefined,
      company_id: params.company_id || undefined,
    },
    signal: params.signal,
  });
  return {
    products: Array.isArray(data?.products) ? data.products : [],
    total: data?.total ?? 0,
  };
}

export async function fetchProductCategories(
  companyId?: string,
  signal?: AbortSignal,
): Promise<ProductCategory[]> {
  const { data } = await api.get<{ categories?: ProductCategory[] }>('/products/categories', {
    params: companyId ? { company_id: companyId } : undefined,
    signal,
  });
  return Array.isArray(data?.categories) ? data.categories : [];
}
