import React, { useState, useEffect } from 'react';
import { initializeDB, getConfig, getExpenses, getIncomes, getSalaryMonths } from './db';
import { Config, Expense, Income } from './types';
import ConfigPanel from './components/ConfigPanel';
import IncomePanel from './components/IncomePanel';
import ExpensesPanel from './components/ExpensesPanel';
import RecurringPanel from './components/RecurringPanel';
import ReportsPanel from './components/ReportsPanel';
import ExportPanel from './components/ExportPanel';
import TripsPanel from './components/TripsPanel';
import Dashboard from './components/Dashboard';
import { BudgetLocProvider, buildLoc } from './loc';
import type { Lang } from './i18n';
import { normalizeCurrency } from './currencies';
import { LayoutDashboard, Settings, TrendingUp, Receipt, Calendar, BarChart3, Download, Moon, Sun, Loader2, Plane } from 'lucide-react';

type Tab = 'dashboard' | 'config' | 'income' | 'expenses' | 'recurring' | 'trips' | 'reports' | 'export';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [config, setConfig] = useState<Config>({ payday: 27, salary: 0, currency: 'EUR', language: 'it' });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  // Stipendio effettivo del mese corrente (include l'eventuale override
  // mensile salvato in Configurazione): usato dalla Dashboard.
  const [currentSalary, setCurrentSalary] = useState<number>(0);
  // Se un pannello ha il form aperto, blocca il cambio tab/filtri esterni
  const [formOpen, setFormOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('mybudget_darkmode');
    return saved ? JSON.parse(saved) : false;
  });
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    // Verifica connessione al backend e carica dati
    initializeDB().then(() => {
      refreshData();
      setDbReady(true);
    }).catch(err => {
      console.error('Errore connessione backend:', err);
      setDbReady(true); // Mostra comunque l'app
    });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mybudget_darkmode', JSON.stringify(darkMode));
  }, [darkMode]);

  const refreshData = async () => {
    try {
      const [c, e, i, months] = await Promise.all([
        getConfig(), getExpenses(), getIncomes(), getSalaryMonths(1),
      ]);
      setConfig(c);
      setExpenses(e);
      setIncomes(i);
      const thisMonth = new Date().toISOString().slice(0, 7);
      const cur = months.find(m => m.month === thisMonth);
      setCurrentSalary(cur ? cur.effective : c.salary);
    } catch (err) {
      console.error('Errore aggiornamento dati:', err);
    }
  }

  const loc = buildLoc((config.language === 'en' ? 'en' : 'it') as Lang, normalizeCurrency(config.currency));
  const t = loc.t;

  const changeTab = (tab: Tab) => {
    if (formOpen) {
      alert(t('app.formOpenAlert'));
      return;
    }
    setActiveTab(tab);
    refreshData();
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; shortLabel: string }[] = [
    { id: 'dashboard', label: t('tab.dashboard'), icon: <LayoutDashboard className="w-5 h-5" />, shortLabel: t('short.dashboard') },
    { id: 'income', label: t('tab.income'), icon: <TrendingUp className="w-5 h-5" />, shortLabel: t('short.income') },
    { id: 'expenses', label: t('tab.expenses'), icon: <Receipt className="w-5 h-5" />, shortLabel: t('short.expenses') },
    { id: 'recurring', label: t('tab.recurring'), icon: <Calendar className="w-5 h-5" />, shortLabel: t('short.recurring') },
    { id: 'trips', label: t('tab.trips'), icon: <Plane className="w-5 h-5" />, shortLabel: t('short.trips') },
    { id: 'reports', label: t('tab.reports'), icon: <BarChart3 className="w-5 h-5" />, shortLabel: t('short.reports') },
    { id: 'export', label: t('tab.export'), icon: <Download className="w-5 h-5" />, shortLabel: t('short.export') },
  ];

  // La Configurazione va sempre in fondo (tutto a destra), come richiesto
  const configTab = { id: 'config' as Tab, label: t('tab.config'), icon: <Settings className="w-5 h-5" />, shortLabel: t('short.config') };

  if (!dbReady) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 text-lg">Inizializzazione database...</p>
          <p className="text-gray-400 text-sm mt-2">MyBudget si sta preparando</p>
        </div>
      </div>
    );
  }

  return (
    <BudgetLocProvider value={loc}>
    <div className="min-h-[100dvh] w-full bg-gray-100 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="w-full px-2 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between min-h-16 py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white text-lg font-bold">{loc.symbol}</span>
              </div>
            </div>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          {/* Desktop Nav: occupa tutta la larghezza disponibile e si adatta al viewport. */}
          <nav className="hidden md:grid md:grid-cols-4 xl:grid-cols-8 w-full gap-2 border-t border-gray-200 dark:border-gray-700 pt-2 pb-2">
            {[...tabs, configTab].map(tab => (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                disabled={formOpen && activeTab !== tab.id}
                className={`min-w-0 w-full flex items-center justify-center gap-2 px-2 sm:px-3 py-2.5 rounded-xl text-xs lg:text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700">
          <div className="flex overflow-x-auto px-2 py-2 gap-3 scrollbar-hide">
            {[...tabs, configTab].map(tab => (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                disabled={formOpen && activeTab !== tab.id}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition disabled:opacity-40 ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {tab.icon}
                {tab.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full min-w-0 px-2 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {activeTab === 'dashboard' && (
          <Dashboard config={config} expenses={expenses} incomes={incomes} currentSalary={currentSalary} />
        )}
        {activeTab === 'config' && (
          <ConfigPanel onConfigChange={(c) => { setConfig(c); refreshData(); }} />
        )}
        {activeTab === 'income' && (
          <IncomePanel onDataUpdate={refreshData} onFormOpenChange={setFormOpen} />
        )}
        {activeTab === 'expenses' && (
          <ExpensesPanel onDataUpdate={refreshData} onFormOpenChange={setFormOpen} />
        )}
        {activeTab === 'recurring' && (
          <RecurringPanel />
        )}
        {activeTab === 'trips' && (
          <TripsPanel onFormOpenChange={setFormOpen} />
        )}
        {activeTab === 'reports' && (
          <ReportsPanel />
        )}
        {activeTab === 'export' && (
          <ExportPanel />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-4 mt-8">
        <div className="w-full px-2 sm:px-4 text-center">
          <p className="text-sm text-gray-500">
            MyBudget © 2024 — {t('app.footer')}
          </p>
        </div>
      </footer>
    </div>
    </BudgetLocProvider>
  );
}
