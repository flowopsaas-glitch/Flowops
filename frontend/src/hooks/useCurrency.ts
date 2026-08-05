/**
 * useCurrency — React hook for multi-currency formatting.
 *
 * Reads the tenant's currency from TenantContext and provides a `money()`
 * function that formats any number in the tenant's configured currency.
 *
 * Usage:
 *   const { money, symbol, currencyCode } = useCurrency();
 *   <span>{money(1500)}</span>  // → "R1,500.00" or "$1,500.00" depending on tenant
 */

import { useTenant } from "../contexts/TenantContext";
import { formatMoney, currencySymbol, getCurrency, getCountry, getMapCenter } from "../lib/currency";
import type { CurrencyConfig, CountryConfig } from "../lib/currency";

export function useCurrency() {
  const { tenant } = useTenant();
  const currencyCode = tenant?.currency ?? 'ZAR';
  const countryCode = tenant?.country ?? 'ZA';
  const config = getCurrency(currencyCode);
  const country = getCountry(countryCode);

  /** Format a number as money in the tenant's currency. */
  function money(amount: number | null | undefined): string {
    return formatMoney(amount, currencyCode);
  }

  /** Get the currency symbol. */
  const symbol = currencySymbol(currencyCode);

  /** Get map center for the tenant's country. */
  const mapCenter = getMapCenter(countryCode);

  return {
    money,
    symbol,
    currencyCode,
    countryCode,
    config,
    country,
    mapCenter,
    formatMoney: (amount: number | null | undefined, overrideCode?: string) =>
      formatMoney(amount, overrideCode ?? currencyCode),
  };
}

export type { CurrencyConfig, CountryConfig };
