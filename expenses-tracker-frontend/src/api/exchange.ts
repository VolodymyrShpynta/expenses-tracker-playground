const BASE_URL = 'https://open.er-api.com/v6/latest';

interface ExchangeRates {
  [currency: string]: number;
}

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  rates: ExchangeRates;
}

/**
 * Fetches the exchange rate from one currency to another using ExchangeRate-API.
 * Returns the rate (1 unit of `from` = rate units of `to`).
 */
export async function fetchExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(from)}`);
  if (!res.ok) throw new Error(`Exchange rate fetch failed: ${res.status}`);
  const data: ExchangeRateResponse = await res.json();
  if (data.result !== 'success') throw new Error('Exchange rate API returned an error');
  const rate = data.rates[to];
  if (rate == null) throw new Error(`No rate found for ${to}`);
  return rate;
}

/**
 * Converts an amount from one currency to another.
 * Returns the converted amount (same unit scale as input).
 */
export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  const rate = await fetchExchangeRate(from, to);
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Supported currencies.
 * Sorted alphabetically by code.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'ILS', name: 'Israeli Shekel' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'ISK', name: 'Icelandic Króna' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PLN', name: 'Polish Złoty' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'UAH', name: 'Ukrainian Hryvnia' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];
