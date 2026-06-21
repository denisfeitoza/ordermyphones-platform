import type { PricingTierCode } from '@shared/pricing';
import type { SupplierCode } from '@shared/supplier';
import type { VariantCondition } from '@shared/catalog';
import { TIERS } from './tiers';

export type PhoneCategory = 'iphone' | 'galaxy-s' | 'galaxy-z' | 'galaxy-a';

export interface ColorOption {
  name: string;
  hex: string;
}

export interface SupplierStock {
  supplier: SupplierCode; // 'source-1' = Assurant · 'source-2' = Mannapov LLC
  availableQty: number;
  unitCostCents: number;
  lead: string;
}

export interface CatalogItem {
  id: string;
  slug: string;
  brand: 'Apple' | 'Samsung';
  model: string;
  category: PhoneCategory;
  condition: VariantCondition; // 'new' | 'cpo'
  image: string;
  colors: ColorOption[];
  storage: number[]; // GB
  rating: number;
  reviews: number;
  msrpCents: number; // tier-1 retail anchor
  stock: SupplierStock[];
  badges: string[];
  year: number;
}

const stk = (supplier: SupplierCode, availableQty: number, unitCostCents: number, lead: string): SupplierStock => ({
  supplier,
  availableQty,
  unitCostCents,
  lead,
});

export const SUPPLIER_NAMES: Record<SupplierCode, string> = {
  'source-1': 'Assurant',
  'source-2': 'Mannapov LLC',
};

export const CATALOG: CatalogItem[] = [
  {
    id: 'iphone-16-pro-max',
    slug: 'iphone-16-pro-max',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    category: 'iphone',
    condition: 'new',
    image: '/generated/iphone-16-pro-max.png',
    colors: [
      { name: 'Desert Titanium', hex: '#C2AE96' },
      { name: 'Natural Titanium', hex: '#C8C2BA' },
      { name: 'White Titanium', hex: '#F2F1EC' },
      { name: 'Black Titanium', hex: '#3B3B3D' },
    ],
    storage: [256, 512, 1024],
    rating: 4.9,
    reviews: 2143,
    msrpCents: 119900,
    stock: [stk('source-1', 38, 98500, 'Ships today'), stk('source-2', 64, 97200, '1–2 days')],
    badges: ['Best seller'],
    year: 2024,
  },
  {
    id: 'iphone-16-pro',
    slug: 'iphone-16-pro',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    category: 'iphone',
    condition: 'new',
    image: '/generated/iphone-16-pro.png',
    colors: [
      { name: 'Natural Titanium', hex: '#C8C2BA' },
      { name: 'Desert Titanium', hex: '#C2AE96' },
      { name: 'White Titanium', hex: '#F2F1EC' },
      { name: 'Black Titanium', hex: '#3B3B3D' },
    ],
    storage: [128, 256, 512],
    rating: 4.8,
    reviews: 1576,
    msrpCents: 99900,
    stock: [stk('source-1', 51, 82000, 'Ships today'), stk('source-2', 47, 81400, '1–2 days')],
    badges: [],
    year: 2024,
  },
  {
    id: 'iphone-16',
    slug: 'iphone-16',
    brand: 'Apple',
    model: 'iPhone 16',
    category: 'iphone',
    condition: 'new',
    image: '/generated/iphone-16.png',
    colors: [
      { name: 'Ultramarine', hex: '#4F5BD5' },
      { name: 'Teal', hex: '#9FC3C0' },
      { name: 'Pink', hex: '#F4C9D0' },
      { name: 'White', hex: '#F2F1EC' },
      { name: 'Black', hex: '#2C2C2E' },
    ],
    storage: [128, 256, 512],
    rating: 4.7,
    reviews: 1284,
    msrpCents: 79900,
    stock: [stk('source-1', 73, 64800, 'Ships today'), stk('source-2', 120, 63900, '1–2 days')],
    badges: ['New'],
    year: 2024,
  },
  {
    id: 'iphone-16-plus',
    slug: 'iphone-16-plus',
    brand: 'Apple',
    model: 'iPhone 16 Plus',
    category: 'iphone',
    condition: 'new',
    image: '/generated/iphone-16-plus.png',
    colors: [
      { name: 'Pink', hex: '#F4C9D0' },
      { name: 'Ultramarine', hex: '#4F5BD5' },
      { name: 'Teal', hex: '#9FC3C0' },
      { name: 'White', hex: '#F2F1EC' },
      { name: 'Black', hex: '#2C2C2E' },
    ],
    storage: [128, 256, 512],
    rating: 4.6,
    reviews: 612,
    msrpCents: 89900,
    stock: [stk('source-1', 22, 73100, 'Ships today'), stk('source-2', 41, 72500, '1–2 days')],
    badges: [],
    year: 2024,
  },
  {
    id: 'iphone-15-pro',
    slug: 'iphone-15-pro-cpo',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    category: 'iphone',
    condition: 'cpo',
    image: '/generated/iphone-15-pro.png',
    colors: [
      { name: 'White Titanium', hex: '#F2F1EC' },
      { name: 'Natural Titanium', hex: '#C8C2BA' },
      { name: 'Blue Titanium', hex: '#3E4654' },
      { name: 'Black Titanium', hex: '#3B3B3D' },
    ],
    storage: [128, 256, 512],
    rating: 4.7,
    reviews: 938,
    msrpCents: 84900,
    stock: [stk('source-1', 16, 67200, 'Ships today')],
    badges: ['Certified Pre-Owned'],
    year: 2023,
  },
  {
    id: 'iphone-14',
    slug: 'iphone-14-cpo',
    brand: 'Apple',
    model: 'iPhone 14',
    category: 'iphone',
    condition: 'cpo',
    image: '/generated/iphone-14.png',
    colors: [
      { name: 'Blue', hex: '#A7C1D9' },
      { name: 'Midnight', hex: '#26272B' },
      { name: 'Starlight', hex: '#F3EFE7' },
      { name: 'Purple', hex: '#C9C2DA' },
      { name: 'Red', hex: '#B5202B' },
    ],
    storage: [128, 256],
    rating: 4.5,
    reviews: 1471,
    msrpCents: 52900,
    stock: [stk('source-2', 88, 41800, '1–2 days'), stk('source-1', 9, 42500, 'Ships today')],
    badges: ['Certified Pre-Owned', 'Value pick'],
    year: 2022,
  },
  {
    id: 'galaxy-s24-ultra',
    slug: 'galaxy-s24-ultra',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    category: 'galaxy-s',
    condition: 'new',
    image: '/generated/galaxy-s24-ultra.png',
    colors: [
      { name: 'Titanium Gray', hex: '#8A8D8F' },
      { name: 'Titanium Black', hex: '#2D2E30' },
      { name: 'Titanium Violet', hex: '#B9A8D0' },
      { name: 'Titanium Yellow', hex: '#E4D9A8' },
    ],
    storage: [256, 512, 1024],
    rating: 4.8,
    reviews: 1689,
    msrpCents: 129900,
    stock: [stk('source-1', 29, 106400, 'Ships today'), stk('source-2', 55, 105200, '1–2 days')],
    badges: ['Best seller'],
    year: 2024,
  },
  {
    id: 'galaxy-s24',
    slug: 'galaxy-s24',
    brand: 'Samsung',
    model: 'Galaxy S24',
    category: 'galaxy-s',
    condition: 'new',
    image: '/generated/galaxy-s24.png',
    colors: [
      { name: 'Cobalt Violet', hex: '#7B6FB0' },
      { name: 'Onyx Black', hex: '#2B2B2D' },
      { name: 'Marble Gray', hex: '#B7B7B5' },
      { name: 'Amber Yellow', hex: '#E7C66B' },
    ],
    storage: [128, 256],
    rating: 4.6,
    reviews: 742,
    msrpCents: 79900,
    stock: [stk('source-2', 96, 63500, '1–2 days'), stk('source-1', 18, 64200, 'Ships today')],
    badges: [],
    year: 2024,
  },
  {
    id: 'galaxy-z-fold6',
    slug: 'galaxy-z-fold6',
    brand: 'Samsung',
    model: 'Galaxy Z Fold6',
    category: 'galaxy-z',
    condition: 'new',
    image: '/generated/galaxy-z-fold6.png',
    colors: [
      { name: 'Silver Shadow', hex: '#C5C7CA' },
      { name: 'Navy', hex: '#2A3550' },
      { name: 'Pink', hex: '#E7C5C9' },
    ],
    storage: [256, 512, 1024],
    rating: 4.5,
    reviews: 388,
    msrpCents: 189900,
    stock: [stk('source-1', 7, 158000, 'Ships today'), stk('source-2', 12, 156500, '1–2 days')],
    badges: ['Foldable'],
    year: 2024,
  },
  {
    id: 'galaxy-z-flip6',
    slug: 'galaxy-z-flip6',
    brand: 'Samsung',
    model: 'Galaxy Z Flip6',
    category: 'galaxy-z',
    condition: 'new',
    image: '/generated/galaxy-z-flip6.png',
    colors: [
      { name: 'Blue', hex: '#6E86C4' },
      { name: 'Silver Shadow', hex: '#C5C7CA' },
      { name: 'Yellow', hex: '#E7D272' },
      { name: 'Mint', hex: '#BFD8C9' },
    ],
    storage: [256, 512],
    rating: 4.6,
    reviews: 524,
    msrpCents: 109900,
    stock: [stk('source-2', 34, 88600, '1–2 days'), stk('source-1', 21, 89400, 'Ships today')],
    badges: ['Foldable'],
    year: 2024,
  },
  {
    id: 'galaxy-a55',
    slug: 'galaxy-a55',
    brand: 'Samsung',
    model: 'Galaxy A55',
    category: 'galaxy-a',
    condition: 'new',
    image: '/generated/galaxy-a55.png',
    colors: [
      { name: 'Navy', hex: '#28344A' },
      { name: 'Iceblue', hex: '#BcD3DF' },
      { name: 'Lilac', hex: '#C6BBD9' },
      { name: 'Lemon', hex: '#E8DC8E' },
    ],
    storage: [128, 256],
    rating: 4.4,
    reviews: 2056,
    msrpCents: 42900,
    stock: [stk('source-2', 210, 33100, '1–2 days'), stk('source-1', 0, 34000, 'Restocking')],
    badges: ['Value pick'],
    year: 2024,
  },
  {
    id: 'galaxy-s23-fe',
    slug: 'galaxy-s23-fe-cpo',
    brand: 'Samsung',
    model: 'Galaxy S23 FE',
    category: 'galaxy-s',
    condition: 'cpo',
    image: '/generated/galaxy-s23-fe.png',
    colors: [
      { name: 'Mint', hex: '#BFD8C9' },
      { name: 'Graphite', hex: '#3A3A3C' },
      { name: 'Cream', hex: '#EFE7D6' },
      { name: 'Purple', hex: '#9B8FC0' },
    ],
    storage: [128, 256],
    rating: 4.4,
    reviews: 803,
    msrpCents: 49900,
    stock: [stk('source-1', 14, 39200, 'Ships today'), stk('source-2', 27, 38600, '1–2 days')],
    badges: ['Certified Pre-Owned'],
    year: 2023,
  },
];

/** Mock tier price from MSRP — the real engine owns this server-side. Integer cents,
 *  rounded to whole dollars for a clean wholesale feel. */
export function unitPriceCents(item: CatalogItem, tier: PricingTierCode): number {
  const t = TIERS.find((x) => x.code === tier) ?? TIERS[0];
  return Math.round((item.msrpCents * (1 - t.discount)) / 100) * 100;
}

export function totalAvailable(item: CatalogItem): number {
  return item.stock.reduce((sum, s) => sum + s.availableQty, 0);
}

export function getItemBySlug(slug: string): CatalogItem | undefined {
  return CATALOG.find((i) => i.slug === slug);
}

export const CATEGORIES: { id: PhoneCategory; label: string }[] = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'galaxy-s', label: 'Galaxy S' },
  { id: 'galaxy-z', label: 'Galaxy Z · Fold & Flip' },
  { id: 'galaxy-a', label: 'Galaxy A' },
];

export const CONDITIONS: { id: VariantCondition; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'cpo', label: 'Certified Pre-Owned' },
];
