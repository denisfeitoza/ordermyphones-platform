export type ProductStatus = 'draft' | 'published' | 'archived';

export type VariantCondition = 'new' | 'cpo' | 'refurbished' | 'used_a' | 'used_b' | 'used_c';

export interface Product {
  id: string;
  slug: string;
  brand: string;
  model: string;
  summary: string;
  description: string; // markdown
  heroImagePath: string;
  viewer3dPath: string | null;
  status: ProductStatus;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  color: string;
  storageGb: number | null;
  condition: VariantCondition;
  attributes: Record<string, unknown>;
}
