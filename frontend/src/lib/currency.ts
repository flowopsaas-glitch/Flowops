/**
 * Multi-currency support for FlowOps.
 *
 * Provides currency configuration, formatting, and country→center mapping
 * for the entire frontend. Tenants pick their currency and country in Settings;
 * every page uses these utilities to display money and center maps.
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
  try {
    const intlCode = config.code === 'ZIG' ? 'USD' : config.code;
    const formatted = new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: intlCode,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(value);
    // Replace Intl's symbol with ours (handles ZiG and locale differences)
    if (config.code === 'ZIG') return formatted.replace(/\$|US\$|USD/, config.symbol);
    return formatted;
  } catch {
    return `${config.symbol}${value.toFixed(config.decimals)}`;
  }
}

/** Returns just the symbol for a currency code. */
export function currencySymbol(code?: string | null): string {
  return getCurrency(code).symbol;
}

// ── Country configuration (for maps + locale) ────────────────────────────────

export interface CountryConfig {
  code: string;
  name: string;
  center: [number, number]; // [lat, lng] for map centering
  zoom: number;
  flag: string;
  defaultCurrency: string;
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  { code: 'ZA', name: 'South Africa', center: [-26.2041, 28.0473], zoom: 6, flag: '🇿🇦', defaultCurrency: 'ZAR' },
  { code: 'ZW', name: 'Zimbabwe', center: [-17.8292, 31.0522], zoom: 7, flag: '🇿🇼', defaultCurrency: 'USD' },
  { code: 'KE', name: 'Kenya', center: [-1.2921, 36.8219], zoom: 7, flag: '🇰🇪', defaultCurrency: 'KES' },
  { code: 'NG', name: 'Nigeria', center: [6.5244, 3.3792], zoom: 7, flag: '🇳🇬', defaultCurrency: 'NGN' },
  { code: 'GH', name: 'Ghana', center: [5.6037, -0.1870], zoom: 7, flag: '🇬🇭', defaultCurrency: 'GHS' },
  { code: 'BW', name: 'Botswana', center: [-24.6282, 25.9231], zoom: 7, flag: '🇧🇼', defaultCurrency: 'BWP' },
  { code: 'MZ', name: 'Mozambique', center: [-25.9692, 32.5732], zoom: 6, flag: '🇲🇿', defaultCurrency: 'MZN' },
  { code: 'ZM', name: 'Zambia', center: [-15.3875, 28.3228], zoom: 7, flag: '🇿🇲', defaultCurrency: 'ZMW' },
  { code: 'TZ', name: 'Tanzania', center: [-6.7924, 39.2083], zoom: 7, flag: '🇹🇿', defaultCurrency: 'TZS' },
  { code: 'UG', name: 'Uganda', center: [0.3476, 32.5825], zoom: 7, flag: '🇺🇬', defaultCurrency: 'UGX' },
  { code: 'RW', name: 'Rwanda', center: [-1.9403, 29.8739], zoom: 9, flag: '🇷🇼', defaultCurrency: 'RWF' },
  { code: 'GB', name: 'United Kingdom', center: [51.5074, -0.1278], zoom: 6, flag: '🇬🇧', defaultCurrency: 'GBP' },
  { code: 'US', name: 'United States', center: [39.8283, -98.5795], zoom: 4, flag: '🇺🇸', defaultCurrency: 'USD' },
  { code: 'AE', name: 'United Arab Emirates', center: [25.2048, 55.2708], zoom: 7, flag: '🇦🇪', defaultCurrency: 'AED' },
  { code: 'IN', name: 'India', center: [20.5937, 78.9629], zoom: 5, flag: '🇮🇳', defaultCurrency: 'INR' },
  { code: 'NA', name: 'Namibia', center: [-22.5597, 17.0832], zoom: 6, flag: '🇳🇦', defaultCurrency: 'ZAR' },
  { code: 'SZ', name: 'Eswatini', center: [-26.5225, 31.4659], zoom: 9, flag: '🇸🇿', defaultCurrency: 'ZAR' },
  { code: 'LS', name: 'Lesotho', center: [-29.6100, 28.2336], zoom: 8, flag: '🇱🇸', defaultCurrency: 'ZAR' },
];

export const COUNTRY_MAP = new Map(SUPPORTED_COUNTRIES.map(c => [c.code, c]));

/** Get country config by code, falling back to South Africa. */
export function getCountry(code?: string | null): CountryConfig {
  return COUNTRY_MAP.get(code?.toUpperCase() ?? 'ZA') ?? SUPPORTED_COUNTRIES[0];
}

/** Get map center coordinates for a country. */
export function getMapCenter(countryCode?: string | null): { center: [number, number]; zoom: number } {
  const country = getCountry(countryCode);
  return { center: country.center, zoom: country.zoom };
}
