/**
 * fx - Tassi di cambio per MyBudget
 *
 * Gli importi nel DB sono salvati nella "valuta base" (config.currency).
 * Quando l'utente cambia valuta, gli importi vengono convertiti al volo
 * con i tassi medi di mercato (fonte: frankfurter.app, ECB, senza API key),
 * cached nel localStorage così l'app funziona anche offline.
 */

import { normalizeCurrency } from './currencies';

const CACHE_KEY = 'mybudget_fx_v1';

export interface FxCache {
  /** Data ISO dell'ultimo aggiornamento riuscito */
  updatedAt: string | null;
  /** Valuta a cui sono riferiti i tassi salvati */
  base: string;
  /** 1 unit of base = rates[code] units of code */
  rates: Record<string, number>;
}

/**
 * Tabella di fallback (tassi indicativi rispetto a EUR): usata solo se
 * non ci sono dati dal network e nessun fallback precedente.
 */
const STATIC_FALLBACK: Record<string, number> = {
  EUR: 1, USD: 1.08, CAD: 1.47, AUD: 1.63, NZD: 1.78, GBP: 0.85, CHF: 0.96,
  SEK: 11.2, NOK: 11.7, DKK: 7.46, ISK: 150, PLN: 4.3, CZK: 25.2, HUF: 395,
  RON: 4.97, BGN: 1.96, HRK: 7.53, RSD: 117, UAH: 42, RUB: 99, TRY: 35,
  ILS: 3.6, AED: 3.97, SAR: 4.05, QAR: 4.04, KWD: 0.334, EGP: 52, NGN: 1650,
  KES: 140, ZAR: 19.8, MAD: 10.8, TND: 3.45, INR: 90, PKR: 302, BDT: 119,
  LKR: 320, NPR: 144, CNY: 7.8, JPY: 162, KRW: 1450, KPW: 9720, HKD: 8.4,
  TWD: 34.5, SGD: 1.45, MYR: 5.1, THB: 38, IDR: 17000, PHP: 62, VND: 26500,
  MMK: 2260, KHR: 4370, LAK: 23500, MNT: 3760, BRL: 5.9, ARS: 1000, MXN: 20,
  COP: 4250, CLP: 1030, PEN: 4.05, UYU: 43, PYG: 8100, BOB: 7.5, VES: 38,
  DOP: 64, GTQ: 8.4, CRC: 540, PAB: 1.08, JMD: 170, AWG: 1.93, BHD: 0.407,
  OMR: 0.416, JOD: 0.766, LBP: 101000, IQD: 1420, IRR: 47000, AFN: 76,
  MVR: 16.6, BTN: 90, MOP: 8.7, BND: 1.45, FJD: 2.45, TOP: 2.55, WST: 2.95,
  XPF: 119.3,
};

function emptyCache(): FxCache {
  return { updatedAt: null, base: 'EUR', rates: { ...STATIC_FALLBACK } };
}

export function loadFxCache(): FxCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FxCache;
      if (parsed && typeof parsed === 'object' && parsed.rates) return parsed;
    }
  } catch { /* cache corrotta: riparti da zero */ }
  return emptyCache();
}

function saveFxCache(cache: FxCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage pieno/non disponibile: ignora */ }
}

/** Normalizza la risposta della API in un FxCache. */
function parseApiResponse(json: any): FxCache | null {
  const base = normalizeCurrency(json?.base);
  const ratesRaw = json?.rates;
  if (!ratesRaw || typeof ratesRaw !== 'object') return null;
  const rates: Record<string, number> = { [base]: 1 };
  for (const [code, v] of Object.entries(ratesRaw)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) rates[normalizeCurrency(code)] = n;
  }
  return {
    updatedAt: typeof json.date === 'string' ? json.date : new Date().toISOString().slice(0, 10),
    base,
    rates,
  };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Prova più fonti gratuite (senza API key) per i tassi rispetto a `base`. */
async function fetchRates(base: string): Promise<FxCache> {
  const b = encodeURIComponent(base);
  const sources = [
    `https://api.frankfurter.app/latest?from=${b}`,
    `https://open.er-api.com/v6/latest/${b}`,
  ];
  let lastErr: unknown = null;
  for (const url of sources) {
    try {
      const json = await fetchJson(url);
      const parsed = parseApiResponse(json);
      if (parsed && Object.keys(parsed.rates).length > 1) return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('No exchange rate source available');
}

/** Scarica e memorizza i tassi aggiornati rispetto alla valuta data. */
export async function refreshFxRates(base?: string): Promise<FxCache> {
  const b = normalizeCurrency(base || loadFxCache().base || 'EUR');
  const fresh = await fetchRates(b);
  // Mantieni sempre la tabella statica come rete di sicurezza per le
  // valute assenti dalla risposta della API.
  const merged: FxCache = {
    updatedAt: fresh.updatedAt,
    base: fresh.base,
    rates: { ...STATIC_FALLBACK, ...fresh.rates },
  };
  saveFxCache(merged);
  return merged;
}

/**
 * Aggiorna i tassi se la cache è vuota o vecchia di oltre un giorno.
 * Non solleva mai: in caso di errore usa la cache/fallback esistenti.
 */
export async function ensureFxRates(base: string): Promise<FxCache> {
  const cache = loadFxCache();
  const today = new Date().toISOString().slice(0, 10);
  const fresh = cache.updatedAt === today && normalizeCurrency(cache.base) === normalizeCurrency(base);
  if (fresh) return cache;
  try {
    return await refreshFxRates(base);
  } catch (e) {
    console.warn('FX: aggiornamento tassi non riuscito, uso la cache:', e);
    return cache;
  }
}

/* ============ Aggiornamento automatico giornaliero ============ */

let scheduledBase: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

type FxListener = (cache: FxCache) => void;
const listeners = new Set<FxListener>();

/** Si iscrive agli aggiornamenti della cache tassi. Restituisce la funzione
 *  per annullare l'iscrizione (da usare negli effetti React). */
export function subscribeFx(fn: FxListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notifyFx(cache: FxCache) {
  for (const fn of listeners) {
    try { fn(cache); } catch { /* ignora errori dei listener */ }
  }
}

function msUntilNextUpdate(): number {
  // Ogni giorno alle 06:00 locali (dopo la pubblicazione dei tassi BCE)
  // oppure subito se oggi non sono ancora passate le 06:00 e la cache
  // non è stata aggiornata oggi.
  const now = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNextTick(base: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    const cache = await ensureFxRates(base).catch(() => null);
    if (cache) notifyFx(cache); // aggiorna l'UI con i nuovi tassi giornalieri
    if (scheduledBase === base) scheduleNextTick(base);
  }, msUntilNextUpdate());
}

/**
 * Programma l'aggiornamento dei tassi: subito (se la cache non è di oggi)
 * e poi ogni giorno alle 06:00. Chiamare di nuovo con una base diversa
 * riprogramma l'aggiornamento per la nuova valuta.
 */
export function scheduleFxUpdates(base: string) {
  const b = normalizeCurrency(base || 'EUR');
  if (scheduledBase === b && timer) return; // già programmato per questa base
  scheduledBase = b;
  if (timer) clearTimeout(timer);
  // Subito: ensureFxRates scarica solo se la cache non è di oggi.
  ensureFxRates(b)
    .then(notifyFx)
    .catch(() => {});
  scheduleNextTick(b);
}

/** Converte un importo dalla valuta `from` alla valuta `to`. */
export function convertAmount(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  cache?: FxCache,
): number {
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (!Number.isFinite(amount)) return 0;
  if (f === t) return amount;
  const fx = cache ?? loadFxCache();
  const rFrom = fx.rates[f];
  const rTo = fx.rates[t];
  if (!rFrom || !rTo || rFrom <= 0) {
    // Nessun tasso disponibile: mostriamo comunque il numero (senza simbolo sbagliato)
    console.warn(`FX: tasso mancante per ${f} -> ${t}`);
    return amount;
  }
  return (amount / rFrom) * rTo;
}
