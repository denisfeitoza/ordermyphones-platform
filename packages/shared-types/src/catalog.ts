export type ProductStatus = 'draft' | 'published' | 'archived';

export type VariantCondition = 'new' | 'cpo' | 'refurbished' | 'used_a' | 'used_b' | 'used_c';

export type ProductCategory = 'phones' | 'accessories' | 'wearables';

/**
 * Normalized carrier. Raw supplier strings (VZW, UNL, Generic, OTH, …) are
 * folded into this canonical set via the synonym map; the original is kept in
 * `carrierRaw`. See docs/architecture/PRODUCT-CATALOG-STANDARD.md §4.
 */
export type Carrier =
  | 'att'
  | 'verizon'
  | 'tmobile'
  | 'sprint'
  | 'boost'
  | 'spectrum'
  | 'xfinity'
  | 'unlocked'
  | 'wifi';

export type LockStatus = 'locked' | 'unlocked';

export type GradeScale = 'DLS' | 'TPS';

export interface Product {
  id: string;
  slug: string;
  brand: string; // = make (Apple / Samsung / Google / …)
  model: string; // "iPhone 11 Pro Max"
  modelNumber: string; // manufacturer part number (MPN): A2161, SM-N986U, G011C
  productFamily: string | null; // "iPhone 11"; phones only, null otherwise
  category: ProductCategory;
  summary: string;
  description: string; // markdown
  heroImagePath: string;
  viewer3dPath: string | null;
  status: ProductStatus;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string; // deterministic, minted from the variant natural key
  color: string | null; // '*' in a feed means unknown → null
  storageGb: number | null;
  capacity: string; // verbatim: '64GB' | '256GB' | '1TB' | '1GB' (non-storage placeholder)
  carrier: Carrier;
  carrierRaw: string; // original supplier string, kept for audit
  lockStatus: LockStatus;
  grade: string; // full grade incl. suffix: 'DLS B+', 'TPS A-'
  gradeScale: GradeScale;
  condition: VariantCondition; // coarse, derived from grade
  protocol: string | null; // 'GSM'; phones only
  attributes: Record<string, unknown>; // reserved/forward-compat: screenSize, ram, launchDate, …
}

/**
 * One row of the canonical import/export CSV. Mirrors the header in
 * docs/integrations/product-import-template.csv and the standard in
 * docs/architecture/PRODUCT-CATALOG-STANDARD.md.
 *
 * Money is integer cents. `quantity` is a non-negative integer; `qtyIsFloor`
 * marks a masked supplier quantity ("200+" → quantity 200, qtyIsFloor true).
 */
export interface CatalogImportRow {
  sku: string;
  make: string;
  model: string;
  modelNumber: string;
  productFamily: string | null;
  category: ProductCategory;
  capacity: string;
  color: string | null;
  carrier: Carrier;
  carrierRaw: string;
  lockStatus: LockStatus;
  grade: string;
  gradeScale: GradeScale;
  condition: VariantCondition;
  protocol: string | null;
  warehouse: string;
  quantity: number;
  qtyIsFloor: boolean;
  unitCostCents: number;
  currency: 'USD';
}
