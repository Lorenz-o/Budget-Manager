/**
 * Valute disponibili in MyBudget.
 * La valuta è salvata come codice ISO 4217 (es. "EUR", "USD") nel DB;
 * il simbolo viene risolto qui per la visualizzazione.
 */

export interface Currency {
  code: string;   // ISO 4217
  symbol: string; // simbolo usato nell'UI
  nameIt: string;
  nameEn: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€', nameIt: 'Euro', nameEn: 'Euro' },
  { code: 'USD', symbol: '$', nameIt: 'Dollaro statunitense', nameEn: 'US Dollar' },
  { code: 'CAD', symbol: 'C$', nameIt: 'Dollaro canadese', nameEn: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', nameIt: 'Dollaro australiano', nameEn: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', nameIt: 'Dollaro neozelandese', nameEn: 'New Zealand Dollar' },
  { code: 'GBP', symbol: '£', nameIt: 'Sterlina britannica', nameEn: 'British Pound' },
  { code: 'CHF', symbol: 'CHF', nameIt: 'Franco svizzero', nameEn: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', nameIt: 'Corona svedese', nameEn: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', nameIt: 'Corona norvegese', nameEn: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', nameIt: 'Corona danese', nameEn: 'Danish Krone' },
  { code: 'ISK', symbol: 'kr', nameIt: 'Corona islandese', nameEn: 'Icelandic Króna' },
  { code: 'PLN', symbol: 'zł', nameIt: 'Złoty polacco', nameEn: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč', nameIt: 'Corona ceca', nameEn: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', nameIt: 'Fiorino ungherese', nameEn: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', nameIt: 'Leu rumeno', nameEn: 'Romanian Leu' },
  { code: 'BGN', symbol: 'лв', nameIt: 'Lev bulgaro', nameEn: 'Bulgarian Lev' },
  { code: 'HRK', symbol: 'kn', nameIt: 'Kuna croata', nameEn: 'Croatian Kuna' },
  { code: 'RSD', symbol: 'din.', nameIt: 'Dinaro serbo', nameEn: 'Serbian Dinar' },
  { code: 'UAH', symbol: '₴', nameIt: 'Hryvnia ucraina', nameEn: 'Ukrainian Hryvnia' },
  { code: 'RUB', symbol: '₽', nameIt: 'Rublo russo', nameEn: 'Russian Ruble' },
  { code: 'TRY', symbol: '₺', nameIt: 'Lira turca', nameEn: 'Turkish Lira' },
  { code: 'ILS', symbol: '₪', nameIt: 'Shekel israeliano', nameEn: 'Israeli Shekel' },
  { code: 'AED', symbol: 'د.إ', nameIt: 'Dirham emiratino', nameEn: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', nameIt: 'Riyal saudita', nameEn: 'Saudi Riyal' },
  { code: 'QAR', symbol: '﷼', nameIt: 'Riyal qatariota', nameEn: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك', nameIt: 'Dinaro kuwaitiano', nameEn: 'Kuwaiti Dinar' },
  { code: 'EGP', symbol: 'E£', nameIt: 'Lira egiziana', nameEn: 'Egyptian Pound' },
  { code: 'NGN', symbol: '₦', nameIt: 'Naira nigeriana', nameEn: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', nameIt: 'Scellina keniota', nameEn: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R', nameIt: 'Rand sudafricano', nameEn: 'South African Rand' },
  { code: 'MAD', symbol: 'DH', nameIt: 'Dirham marocchino', nameEn: 'Moroccan Dirham' },
  { code: 'TND', symbol: 'DT', nameIt: 'Dinaro tunisino', nameEn: 'Tunisian Dinar' },
  { code: 'INR', symbol: '₹', nameIt: 'Rupia indiana', nameEn: 'Indian Rupee' },
  { code: 'PKR', symbol: '₨', nameIt: 'Rupia pakistana', nameEn: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', nameIt: 'Taka bangladese', nameEn: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: 'Rs', nameIt: 'Rupia dello Sri Lanka', nameEn: 'Sri Lankan Rupee' },
  { code: 'NPR', symbol: 'रू', nameIt: 'Rupia nepalese', nameEn: 'Nepalese Rupee' },
  { code: 'CNY', symbol: '¥', nameIt: 'Yuan renminbi', nameEn: 'Chinese Yuan' },
  { code: 'JPY', symbol: '¥', nameIt: 'Yen giapponese', nameEn: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', nameIt: 'Won sudcoreano', nameEn: 'South Korean Won' },
  { code: 'KPW', symbol: '₩', nameIt: 'Won nordcoreano', nameEn: 'North Korean Won' },
  { code: 'HKD', symbol: 'HK$', nameIt: 'Dollaro di Hong Kong', nameEn: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', nameIt: 'Dollaro taiwanese', nameEn: 'Taiwanese Dollar' },
  { code: 'SGD', symbol: 'S$', nameIt: 'Dollaro di Singapore', nameEn: 'Singapore Dollar' },
  { code: 'MYR', symbol: 'RM', nameIt: 'Ringgit malese', nameEn: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿', nameIt: 'Baht thailandese', nameEn: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', nameIt: 'Rupia indonesiana', nameEn: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', nameIt: 'Peso filippino', nameEn: 'Philippine Peso' },
  { code: 'VND', symbol: '₫', nameIt: 'Dong vietnamita', nameEn: 'Vietnamese Dong' },
  { code: 'MMK', symbol: 'K', nameIt: 'Kyat birmano', nameEn: 'Myanmar Kyat' },
  { code: 'KHR', symbol: '៛', nameIt: 'Riel cambogiano', nameEn: 'Cambodian Riel' },
  { code: 'LAK', symbol: '₭', nameIt: 'Kip laotiano', nameEn: 'Laos Kip' },
  { code: 'MNT', symbol: '₮', nameIt: 'Tögrög mongolo', nameEn: 'Mongolian Tögrög' },
  { code: 'BRL', symbol: 'R$', nameIt: 'Real brasiliano', nameEn: 'Brazilian Real' },
  { code: 'ARS', symbol: '$', nameIt: 'Peso argentino', nameEn: 'Argentine Peso' },
  { code: 'MXN', symbol: '$', nameIt: 'Peso messicano', nameEn: 'Mexican Peso' },
  { code: 'COP', symbol: '$', nameIt: 'Peso colombiano', nameEn: 'Colombian Peso' },
  { code: 'CLP', symbol: '$', nameIt: 'Peso cileno', nameEn: 'Chilean Peso' },
  { code: 'PEN', symbol: 'S/', nameIt: 'Sol peruviano', nameEn: 'Peruvian Sol' },
  { code: 'UYU', symbol: '$U', nameIt: 'Peso uruguaiano', nameEn: 'Uruguayan Peso' },
  { code: 'PYG', symbol: '₲', nameIt: 'Guaraní paraguaiano', nameEn: 'Paraguayan Guarani' },
  { code: 'BOB', symbol: 'Bs', nameIt: 'Boliviano', nameEn: 'Bolivian Boliviano' },
  { code: 'VES', symbol: 'Bs.', nameIt: 'Bolívar sovrano', nameEn: 'Venezuelan Bolívar' },
  { code: 'DOP', symbol: 'RD$', nameIt: 'Peso dominicano', nameEn: 'Dominican Peso' },
  { code: 'GTQ', symbol: 'Q', nameIt: 'Quetzal guatemalteco', nameEn: 'Guatemalan Quetzal' },
  { code: 'CRC', symbol: '₡', nameIt: 'Colón costaricano', nameEn: 'Costa Rican Colón' },
  { code: 'PAB', symbol: 'B/.', nameIt: 'Balboa panamense', nameEn: 'Panamanian Balboa' },
  { code: 'JMD', symbol: 'J$', nameIt: 'Dollaro giamaicano', nameEn: 'Jamaican Dollar' },
  { code: 'AWG', symbol: 'ƒ', nameIt: 'Fiorino arubano', nameEn: 'Aruban Florin' },
  { code: 'BHD', symbol: '.د.ب', nameIt: 'Dinaro bahreinita', nameEn: 'Bahraini Dinar' },
  { code: 'OMR', symbol: '﷼', nameIt: 'Riyal omanita', nameEn: 'Omani Rial' },
  { code: 'JOD', symbol: 'د.ا', nameIt: 'Dinaro giordano', nameEn: 'Jordanian Dinar' },
  { code: 'LBP', symbol: 'ل.ل', nameIt: 'Lira libanese', nameEn: 'Lebanese Pound' },
  { code: 'IQD', symbol: 'ع.د', nameIt: 'Dinaro iracheno', nameEn: 'Iraqi Dinar' },
  { code: 'IRR', symbol: '﷼', nameIt: 'Rial iraniano', nameEn: 'Iranian Rial' },
  { code: 'AFN', symbol: '؋', nameIt: 'Afghani', nameEn: 'Afghan Afghani' },
  { code: 'MVR', symbol: 'Rf', nameIt: 'Rufiyaa maldiviano', nameEn: 'Maldivian Rufiyaa' },
  { code: 'BTN', symbol: 'Nu.', nameIt: 'Ngultrum bhutanese', nameEn: 'Bhutanese Ngultrum' },
  { code: 'MOP', symbol: 'MOP$', nameIt: 'Pataca di Macao', nameEn: 'Macanese Pataca' },
  { code: 'BND', symbol: 'B$', nameIt: 'Dollaro del Brunei', nameEn: 'Brunei Dollar' },
  { code: 'FJD', symbol: 'FJ$', nameIt: 'Dollaro delle Figi', nameEn: 'Fijian Dollar' },
  { code: 'TOP', symbol: 'T$', nameIt: 'Pa\'anga tongano', nameEn: 'Tongan Paʻanga' },
  { code: 'WST', symbol: 'WS$', nameIt: 'Tala samoano', nameEn: 'Samoan Tala' },
  { code: 'XPF', symbol: '₣', nameIt: 'Franco CFP', nameEn: 'CFP Franc' },
];

const BY_CODE: Record<string, Currency> = Object.fromEntries(
  CURRENCIES.map(c => [c.code, c])
);

/** Restituisce il simbolo della valuta (fallback: il codice stesso). */
export function currencySymbol(code?: string | null): string {
  if (!code) return '€';
  const c = BY_CODE[code];
  if (c) return c.symbol;
  // Valuta sconosciuta al elenco: provo comunque col formato Intl
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code })
      .formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

export function currencyName(code: string, lang: 'it' | 'en'): string {
  const c = BY_CODE[code];
  if (!c) return code;
  return lang === 'it' ? `${c.nameIt} (${c.code})` : `${c.nameEn} (${c.code})`;
}

/** Normalizza valori storici/backup: simboli vecchi -> codici ISO. */
export function normalizeCurrency(raw?: string | null): string {
  if (!raw) return 'EUR';
  const v = raw.trim();
  if (BY_CODE[v]) return v; // già codice ISO
  const bySymbol = CURRENCIES.find(c => c.symbol === v);
  if (bySymbol) return bySymbol.code;
  const map: Record<string, string> = { '£': 'GBP', '$': 'USD', '¥': 'JPY', '₹': 'INR' };
  return map[v] ?? 'EUR';
}
