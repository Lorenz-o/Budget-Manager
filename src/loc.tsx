/**
 * Localizzazione runtime: context React con lingua corrente,
 * simbolo valuta e helper per formattare importi e date.
 * Gli importi salvati nel DB sono nella "valuta di salvataggio":
 * `conv` li converte nella valuta selezionata con i tassi in cache,
 * che si aggiornano automaticamente ogni giorno (vedi fx.ts).
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Lang } from './i18n';
import { translate, translateLabel } from './i18n';
import { currencySymbol, normalizeCurrency } from './currencies';
import { convertAmount, loadFxCache, scheduleFxUpdates, subscribeFx, type FxCache } from './fx';

export interface Loc {
  lang: Lang;
  currencyCode: string;
  symbol: string;
  /** Versione della cache tassi: fa scattare i re-render dei useMemo a valle */
  fxVersion: number;
  /** Tassi correnti (per conversioni puntuali, es. viaggi) */
  fxRates: FxCache;
  /** Valuta in cui gli importi del DB sono salvati */
  saveCurrency: string;
  /** Converte un importo dalla valuta di salvataggio a quella attiva */
  conv: (amount: number, from?: string | null) => number;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Traduce le etichette predefinite (categorie/tipi) nella lingua attiva */
  tl: (label?: string | null) => string;
  /** "1.234,56" senza simbolo (usato dove il simbolo è già nell'etichetta) */
  fmtNum: (n: number) => string;
  /** "{simbolo}{numero}" es. €1.234,56 oppure $1,234.56 */
  fmt: (n: number) => string;
  /** Mese "YYYY-MM" -> "ottobre 2026" / "October 2026" */
  monthLabel: (monthKey: string) => string;
  /** Data ISO -> "05/10/2026" / "05 Oct 2026" */
  dateLabel: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  /** Data ISO -> "05 ott" / "05 Oct" (per le timeline mensili) */
  dayMonthLabel: (iso: string) => string;
  /** Formatta un importo in una valuta arbitraria, es. "$1,234.56" */
  fmtIn: (n: number, code: string) => string;
}

const LOCALES: Record<Lang, string> = { it: 'it-IT', en: 'en-GB' };

/**
 * Costruisce l'oggetto Loc. `saveCurrency` è la valuta in cui gli importi
 * sono salvati nel DB (default: stessa valuta di visualizzazione, quindi
 * nessuna conversione).
 */
export function buildLoc(lang: Lang, currencyCode: string, saveCurrency?: string): Loc {
  const locale = LOCALES[lang] ?? 'it-IT';
  const target = normalizeCurrency(currencyCode);
  const source = normalizeCurrency(saveCurrency || currencyCode);
  const symbol = currencySymbol(target);
  const fxRates = loadFxCache();
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    lang,
    currencyCode: target,
    symbol,
    saveCurrency: source,
    fxVersion: fxRates.updatedAt ? Number(new Date(`${fxRates.updatedAt}T00:00:00`) || 0) : 0,
    fxRates,
    conv: (amount: number, from?: string | null) =>
      convertAmount(amount, from || source, target, fxRates),
    t: (key, vars) => translate(lang, key, vars),
    tl: (label) => translateLabel(lang, label),
    fmtNum: (n) => nf.format(Number.isFinite(n) ? n : 0),
    fmt: (n) => `${symbol}${nf.format(Number.isFinite(n) ? n : 0)}`,
    monthLabel: (monthKey: string) => {
      // Costruzione sicura: YYYY-MM-01 in orario locale
      const [y, m] = monthKey.split('-').map(Number);
      const date = new Date(y, (m || 1) - 1, 1);
      return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    },
    dateLabel: (iso: string, opts?: Intl.DateTimeFormatOptions) => {
      if (!iso) return '';
      const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(locale, opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
    dayMonthLabel: (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    },
    fmtIn: (n: number, code: string) => {
      const c = normalizeCurrency(code);
      return `${currencySymbol(c)}${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number.isFinite(n) ? n : 0)}`;
    },
  };
}

const defaultLoc = buildLoc('it', 'EUR');

const LocContext = createContext<Loc>(defaultLoc);

const LocProvider = LocContext.Provider;

/**
 * Provider "attivo": oltre a fornire l'oggetto Loc, programma l'aggiornamento
 * automatico dei tassi (subito se la cache non è di oggi, poi ogni giorno alle
 * 06:00) e fa re-renderizzare i consumatori quando arrivano tassi nuovi.
 */
export function BudgetLocProvider({ value, children }: { value: Loc; children: React.ReactNode }) {
  const [fx, setFx] = useState<FxCache>(value.fxRates);
  useEffect(() => {
    scheduleFxUpdates(value.saveCurrency);
    return subscribeFx(setFx);
  }, [value.saveCurrency]);
  // Se sono arrivati tassi più recenti del Loc corrente, rigeneriamo il contesto
  const loc = fx.updatedAt !== value.fxRates.updatedAt || fx.base !== value.fxRates.base
    ? buildLoc(value.lang, value.currencyCode, value.saveCurrency)
    : value;
  return <LocProvider value={loc}>{children}</LocProvider>;
}

export function useLoc(): Loc {
  return useContext(LocContext);
}
