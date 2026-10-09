/**
 * Database Layer - MyBudget
 * Comunica con il backend Python/Flask via API REST.
 * Il database reale è SQLite (mybudget.db).
 */

import { Config, Income, Expense, Category, Trip, TripCost } from './types';

// URL base API
// In produzione (servito da Flask): '/api'
// In sviluppo (Vite dev server):   '/api' → proxato a http://localhost:5000
//                                   da vite.config.js (stessa origine: niente
//                                   CORS e niente errori misti)
// Override manuale: finestra.__MYBUDGET_API_BASE__ oppure localStorage
//                   'mybudget_api_base' (es. 'http://192.168.1.10:5000/api').
function resolveApiBase(): string {
  const w = window as any;
  const candidates = [w.__MYBUDGET_API_BASE__, w.localStorage?.getItem('mybudget_api_base')];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim().replace(/\/+$/, '');
    }
  }
  return '/api';
}

const API_BASE = resolveApiBase();

// Risposta HTML al posto del JSON = il server NON sta rispondendo dalle API.
// Tipico: pagina di errore/404 del dev server Vite (backend Flask spento o
// porta sbagliata) oppure captive portal/proxy che intercetta la chiamata.
// Da qui il classico "Unexpected token '<', &quot;&lt;!doctype &quot;... is not valid JSON".
function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 512).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') ||
         head.includes('<body') || head.includes('<title>');
}

// Messaggio leggibile in base alla causa piu' probabile
function buildFailureMessage(status: number, bodyText: string): string {
  if (looksLikeHtml(bodyText)) {
    if (status === 404) {
      return 'Backend non raggiungibile: il server ha risposto con una pagina HTML ' +
        "(404) invece dei dati JSON. Di solito significa che il server Python non e' " +
        'in esecuzione (oppure e\' in esecuzione su un\'altra porta). ' +
        'Avvia il backend: Avvia-MyBudget.bat / start.sh, oppure "python backend/app.py". ' +
        'Se usi "npm run dev", il backend Flask deve essere avviato a parte su porta 5000.';
    }
    return 'Il server ha risposto con una pagina HTML invece dei dati JSON ' +
      `(HTTP ${status}): richiesta intercettata da un altro server/proxy.`;
  }
  if (status === 404) {
    return 'Endpoint API non trovato (404): il backend e\' in esecuzione ma e\' ' +
      'una versione vecchia/priva di questa rotta. Riavvia il server (Avvia-MyBudget.bat / start.sh).';
  }
  if (status === 500 || status === 502 || status === 503) {
    return `Errore del server (HTTP ${status}): controlla la console/log del backend.`;
  }
  return `API Error: ${status}`;
}

// Parse difensivo: mai lasciar passare la SyntaxError nativa di JSON.parse
async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Risposta vuota dal server (backend in crash o request bloccata)');
  }
  const isJson = contentType.includes('json');
  if (!isJson && looksLikeHtml(text)) {
    throw new Error(buildFailureMessage(response.status, text));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(buildFailureMessage(response.status, text));
  }
}

// Helper per chiamate fetch
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e: any) {
    // Failed to fetch = processo backend assente/porta chiusa/rete down
    throw new Error(
      'Backend non raggiungibile: impossibile contattare il server ' +
      `(fetch fallita${e?.message ? `: ${e.message}` : ''}). ` +
      'Avvia il backend (Avvia-MyBudget.bat / start.sh oppure "python backend/app.py") e ricarica la pagina.'
    );
  }
  if (!response.ok) {
    // Se il backend ha inviato un messaggio d'errore (JSON), mostriamo quello
    let message: string;
    try {
      const body = await parseJsonResponse<any>(response);
      message = (body && typeof body.error === 'string')
        ? body.error
        : `API Error: ${response.status} ${response.statusText}`;
    } catch (err: any) {
      message = err?.message || `API Error: ${response.status} ${response.statusText}`;
    }
    throw new Error(message);
  }
  return parseJsonResponse<T>(response);
}

// ============ CONFIG ============

export async function getConfig(): Promise<Config> {
  return apiFetch<Config>('/config');
}

export async function saveConfig(config: Config): Promise<void> {
  await apiFetch('/config', {
    method: 'PUT',
    body: JSON.stringify({
      payday: config.payday,
      salary: config.salary,
      currency: config.currency,
      language: config.language ?? 'it',
      savings_base: (config as any).savings_base ?? (config as any).savingsBase ?? 0,
    }),
  });
}

// ============ INCOMES ============

export async function getIncomes(): Promise<Income[]> {
  return apiFetch<Income[]>('/incomes');
}

export async function addIncome(
  income: Omit<Income, 'id'>
): Promise<number> {
  const result = await apiFetch<{ id: number }>('/incomes', {
    method: 'POST',
    body: JSON.stringify(income),
  });

  return result.id;
}

export async function updateIncome(income: Income): Promise<void> {
  await apiFetch(`/incomes/${income.id}`, {
    method: 'PUT',
    body: JSON.stringify(income),
  });
}

export async function deleteIncome(id: number): Promise<void> {
  await apiFetch(`/incomes/${id}`, { method: 'DELETE' });
}

// ============ EXPENSES ============

export async function getExpenses(): Promise<Expense[]> {
  return apiFetch<Expense[]>('/expenses');
}

export async function addExpense(
  expense: Omit<Expense, 'id'>
): Promise<number> {
  const result = await apiFetch<{ id: number }>('/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  });

  return result.id;
}
export async function updateExpense(expense: Expense): Promise<void> {
  await apiFetch(`/expenses/${expense.id}`, {
    method: 'PUT',
    body: JSON.stringify(expense),
  });
}

export async function deleteExpense(id: number): Promise<void> {
  await apiFetch(`/expenses/${id}`, { method: 'DELETE' });
}

// ============ CATEGORIES ============

export async function getExpenseCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories/expenses');
}

export async function addExpenseCategory(
  category: Omit<Category, 'id'>
): Promise<number> {
  const result = await apiFetch<{ id: number }>('/categories/expenses', {
    method: 'POST',
    body: JSON.stringify(category),
  });

  return result.id;
}

export async function getIncomeCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories/incomes');
}

export async function addIncomeCategory(
  category: Omit<Category, 'id'>
): Promise<number> {
  const result = await apiFetch<{ id: number }>('/categories/incomes', {
    method: 'POST',
    body: JSON.stringify(category),
  });

  return result.id;
}

// ============ RECURRING PAYMENTS ============

export interface FuturePayment {
  id: string;
  original_id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  type: string;
  is_future: boolean;
  is_paid: boolean;
  occurrence: number;
  total_occurrences?: number;
  notes?: string;
}

export async function getRecurringFuture(months: number = 12): Promise<FuturePayment[]> {
  return apiFetch<FuturePayment[]>(`/recurring/future?months=${months}`);
}

// ============ STIPENDIO PER MESE ============

import type { SalaryMonth } from './types';

/**
 * Mesi disponibili per l'override dello stipendio.
 * `from` (default 'current'): da quale mese partire.
 * `direction` (default 'future'): se andare in avanti o indietro nel tempo.
 * Di default si mostrano i mesi da quello corrente in avanti: i mesi
 * passati non vengono più "conteggiati" perché lo stipendio è già storico.
 */
export async function getSalaryMonths(
  months: number = 12,
  opts?: { from?: 'current' | 'past'; direction?: 'future' | 'past' },
): Promise<SalaryMonth[]> {
  const params = new URLSearchParams();
  params.set('months', String(months));
  if (opts?.from) params.set('from', opts.from);
  if (opts?.direction) params.set('direction', opts.direction);
  return apiFetch<SalaryMonth[]>(`/salary/months?${params.toString()}`);
}

export async function setSalaryOverride(month: string, amount: number | null): Promise<void> {
  await apiFetch('/salary/override', {
    method: 'POST',
    body: JSON.stringify({ month, amount }),
  });
}

// ============ TRIPS (VIAGGI) ============

export async function getTrips(): Promise<Trip[]> {
  return apiFetch<Trip[]>('/trips');
}

export async function addTrip(trip: Trip): Promise<void> {
  await apiFetch('/trips', { method: 'POST', body: JSON.stringify(trip) });
}

export async function updateTrip(trip: Trip): Promise<void> {
  await apiFetch(`/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(trip) });
}

export async function deleteTrip(id: string): Promise<void> {
  await apiFetch(`/trips/${id}`, { method: 'DELETE' });
}

export async function getTripCosts(tripId?: string): Promise<TripCost[]> {
  const q = tripId ? `?trip_id=${encodeURIComponent(tripId)}` : '';
  return apiFetch<TripCost[]>(`/trip-costs${q}`);
}

export async function addTripCost(cost: TripCost): Promise<void> {
  await apiFetch('/trip-costs', { method: 'POST', body: JSON.stringify(cost) });
}

export async function updateTripCost(cost: TripCost): Promise<void> {
  await apiFetch(`/trip-costs/${cost.id}`, { method: 'PUT', body: JSON.stringify(cost) });
}

export async function deleteTripCost(id: string): Promise<void> {
  await apiFetch(`/trip-costs/${id}`, { method: 'DELETE' });
}

// ============ REPORT SALUTE FINANZIARIA ============

/** Una riga del report salute finanziaria (mese per mese). */
export interface HealthMonth {
  month: string;               // 'YYYY-MM'
  salary: number;              // stipendio effettivo del mese (base o override)
  extraIncomes: number;        // entrate extra
  totalIncome: number;         // stipendio + extra
  livingExpenses: number;      // spese vive (esclusi accantonamenti/PAC)
  essentialExpenses: number;   // abbonamenti + rate
  discretionaryExpenses: number; // spese discrezionali
  balance: number;             // entrate - spese vive
  savingsBase: number;         // risparmi di base (inseriti a mano)
  accruedAtFirstPayday: number; // totale accantonamenti dal 1° stipendio del mese
  savingsTotal: number;        // risparmi di base + accantonamenti del mese
  savingsRate: number;         // % saldo/entrate
  expenseRatio: number;        // % spese/entrate
  dailyBudget: number;         // budget giornaliero residuo
}

export interface HealthReport {
  generatedAt: string;
  currency: string;
  config: { salary: number; payday: number; savingsBase: number };
  monthly: HealthMonth[];
  current: HealthMonth | null;
  score: number | null;        // punteggio composito 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';
  components: Record<'savingsRate' | 'expenseRatio' | 'savingsFund' | 'liquidity', number> | null;
  insights: { level: 'ok' | 'warn' | 'danger'; text_it: string; text_en: string }[];
}

export async function getHealthReport(months: number = 6): Promise<HealthReport> {
  return apiFetch<HealthReport>(`/health-report?months=${months}`);
}

// ============ STATS & BACKUP ============

// Statistiche aggregate del mese corrente (calcolate dal backend):
// salute finanziaria precisa, percentuali corrette e totale risparmi.
export interface MonthStats {
  month: string;              // YYYY-MM
  totalIncome: number;
  consumed: number;           // spese del mese (senza accantonamenti)
  balance: number;
  expenseRatio: number;       // % spese/entrate (1 decimale)
  savingsRate: number;        // % saldo/entrate
  subscriptionsTotal: number;
  savingsBase: number;        // risparmi di base (config, salvata a DB)
  savingsAccrued: number;     // occorrenze savings/PAC del mese
  savingsTotal: number;       // base + accantonati
  dailyBudget: number;
  score: number | null;       // punteggio composito 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';
}

export interface FuturePayment {
  id: string;
  original_id: string;

  description: string;
  amount: number;
  date: string;
  category: string;
  type: string;

  is_future: boolean;
  is_paid: boolean;

  occurrence: number;
  total_occurrences?: number;

  notes?: string;

  is_excluded?: boolean;
  is_extinguished?: boolean;
}

export async function getMonthStats(): Promise<MonthStats> {
  return apiFetch<MonthStats>('/month-stats');
}

export async function getDBStats(): Promise<{
  totalIncomes: number;
  totalExpenses: number;
  totalCategories: number;
  dbSize: string;
  dbPath: string;
}> {
  return apiFetch('/stats');
}

export async function exportAllData(): Promise<string> {
  const data = await apiFetch<object>('/backup/export');
  return JSON.stringify(data, null, 2);
}

export async function importAllData(jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString);
  await apiFetch('/backup/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============ UTILS ============

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Inizializzazione (compatibilità - non serve più con backend)
export async function initializeDB(): Promise<void> {
  // Il backend inizializza SQLite automaticamente
  console.log('🗄️ Backend SQLite pronto');
}
export async function deleteRecurringOccurrence(
  originalId: string,
  date: string
): Promise<void> {
  await apiFetch('/recurring/exclude-occurrence', {
    method: 'POST',
    body: JSON.stringify({
      original_id: originalId,
      occurrence_date: date,
    }),
  });
}

export async function terminateRecurringFrom(
  originalId: string,
  date: string
): Promise<void> {
  await apiFetch('/recurring/terminate', {
    method: 'POST',
    body: JSON.stringify({
      original_id: originalId,
      from_date: date,
    }),
  });
}

export async function deleteRecurringMonth(
  month: string
): Promise<void> {
  await apiFetch('/recurring/exclude-month', {
    method: 'POST',
    body: JSON.stringify({ month }),
  });
}

export async function deleteAllMovements(): Promise<void> {
  await apiFetch('/data/delete-all-movements', {
    method: 'POST',
  });
}

export async function resetAllData(): Promise<void> {
  await apiFetch('/data/reset', {
    method: 'POST',
  });
}

