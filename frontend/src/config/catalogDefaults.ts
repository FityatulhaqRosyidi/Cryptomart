import type { DiscountRule, ProductItem } from '../types/cryptomart'

/**
 * Default catalog and discount rules used as fallback when backend /api/catalog
 * is unreachable.
 * Includes the reference pricing example from Section 2.4 (price=12500, d=0.1, k=500).
 */
export const DEFAULT_PRODUCTS: ProductItem[] = [
  {
    product_id: 'CAKE-STRW',
    numeric_id: 1,
    name: 'Strawberry Shortcake',
    category: 'Bakery',
    unit_price: 12500,
    description: 'Reference test item (Rp 12.500) matching specification example.',
  },
  {
    product_id: 'CAKE-CHOC',
    numeric_id: 2,
    name: 'Dark Chocolate Tart',
    category: 'Bakery',
    unit_price: 25000,
    description: 'Rich dark ganache tart.',
  },
  {
    product_id: 'CAKE-MTC',
    numeric_id: 3,
    name: 'Matcha Mille Crepe',
    category: 'Bakery',
    unit_price: 32500.5,
    description: 'Layered Uji matcha crepe cake with fractional pricing.',
  },
  {
    product_id: 'COFF-ESP',
    numeric_id: 4,
    name: 'Cafe 702 Espresso Blend',
    category: 'Beverage',
    unit_price: 18750.25,
    description: 'House-roasted dark espresso.',
  },
  {
    product_id: 'TEA-EARL',
    numeric_id: 5,
    name: 'Bergamot Earl Grey',
    category: 'Beverage',
    unit_price: 15000,
    description: 'Aromatic loose-leaf black tea.',
  },
]

export const DEFAULT_DISCOUNTS: DiscountRule[] = [
  {
    discount_code: 'NONE',
    numeric_id: 0,
    label: 'No Discount (d = 0, k = 0)',
    percentage_discount: 0,
    fixed_cut: 0,
  },
  {
    discount_code: 'REF10_500',
    numeric_id: 1,
    label: 'Reference Promo: 10% + Rp 500 Cut',
    percentage_discount: 0.1,
    fixed_cut: 500,
  },
  {
    discount_code: 'PERCENT15',
    numeric_id: 2,
    label: '15% Percentage Off (d = 0.15, k = 0)',
    percentage_discount: 0.15,
    fixed_cut: 0,
  },
  {
    discount_code: 'FLAT2500',
    numeric_id: 3,
    label: 'Rp 2.500 Flat Voucher (d = 0, k = 2500)',
    percentage_discount: 0,
    fixed_cut: 2500,
  },
  {
    discount_code: 'VIP20_1000',
    numeric_id: 4,
    label: 'VIP 20% + Rp 1.000 Cut (d = 0.2, k = 1000)',
    percentage_discount: 0.2,
    fixed_cut: 1000,
  },
]
