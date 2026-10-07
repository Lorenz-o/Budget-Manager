export interface Config {
  id?: number;
  payday: number; // giorno del mese (1-31)
  salary: number; // stipendio mensile
  currency: string; // codice ISO 4217, es. "EUR"
  language?: string; // 'it' | 'en'
  // Risparmi: cifra inserita a mano in Configurazione, che si somma
  // automaticamente agli accantonamenti del primo stipendio del mese.
  savings_base?: number;
}

export interface Income {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO date
  category: string;
  recurring: boolean;
  recurringDay?: number;
}

// Stipendio effettivo di un singolo mese (storico mensile)
export interface SalaryMonth {
  month: string; // YYYY-MM
  baseSalary: number;
  override: number | null;
  effective: number;
  manualIncomeId: string | null;
  manualAmount: number | null;
}

export type ExpenseType = 'single' | 'subscription' | 'installment' | 'savings' | 'pac';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO date
  category: string;
  type: ExpenseType;
  installments?: number; // numero rate totali
  installmentsPaid?: number; // rate già pagate
  endDate?: string; // per abbonamenti
  notes?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  expensesByCategory: Record<string, number>;
  expensesByType: Record<ExpenseType, number>;
}

// ============ VIAGGI ============

export type TripStatus = 'upcoming' | 'ongoing' | 'completed';

export interface Trip {
  id: string;
  name: string;
  destination?: string;
  startDate?: string; // ISO date (YYYY-MM-DD)
  endDate?: string;   // ISO date (YYYY-MM-DD)
  budget: number;     // nella valuta del viaggio
  currency: string;   // codice ISO 4217 personalizzato per il viaggio
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  // Campi calcolati dal backend (riepilogo costi)
  spent?: number;
  costCount?: number;
}

export interface TripCost {
  id: string;
  tripId: string;
  description: string;
  amount: number;     // nella valuta del viaggio
  date: string;       // ISO date
  category: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

