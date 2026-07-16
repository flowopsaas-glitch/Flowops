/**
 * Multi-currency formatting utility.
 *
 * Maps ISO 4217 currency codes → symbol, locale, and decimal formatting.
 * Used across invoices, rate cards, waybills, dashboards, and email templates.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'en-IE', decimals: 2 },
  { code: 'ZIG', symbol: 'ZiG', name: 'Zimbabwe Gold', locale: 'en-ZW', decimals: 2 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE', decimals: 2 },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', decimals: 2 },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula', locale: 'en-BW', decimals: 2 },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical', locale: 'pt-MZ', decimals: 2 },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha', locale: 'en-ZM', decimals: 2 },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', locale: 'sw-TZ', decimals: 0 },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', locale: 'en-UG', decimals: 0 },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', locale: 'en-GH', decimals: 2 },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', locale: 'rw-RW', decimals: 0 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', locale: 'ar-AE', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', decimals: 2 },
];

export const CURRENCY_MAP = new Map(SUPPORTED_CURRENCIES.map(c => [c.code, c]));

/** Get currency config by code, falling back to ZAR. */
export function getCurrency(code?: string | null): CurrencyConfig {
  return CURRENCY_MAP.get(code?.toUpperCase() ?? 'ZAR') ?? SUPPORTED_CURRENCIES[0];
}

/**
 * Format a numeric amount as a currency string.
 * @example formatMoney(1499.5, 'USD') → "$1,499.50"
 * @example formatMoney(1499.5, 'ZAR') → "R1,499.50"
 */
export function formatMoney(amount: number | null | undefined, currencyCode?: string | null): string {
  const value = amount ?? 0;
  const config = getCurrency(currencyCode);

  // Use Intl for proper grouping/decimal separators
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code === 'ZIG' ? 'USD' : config.code, // ZiG not in Intl yet
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(value).replace(/US\$|USD/, config.symbol); // fix ZiG display
  } catch {
    // Fallback: simple formatting
    return `${config.symbol}${value.toFixed(config.decimals)}`;
  }
}

/** Returns just the symbol for a currency code. */
export function currencySymbol(code?: string | null): string {
  return getCurrency(code).symbol;
}
