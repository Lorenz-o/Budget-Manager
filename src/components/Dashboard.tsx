import React, { useMemo, useState, useEffect } from 'react';
import { Config, Expense, Income, Trip } from '../types';
import { getRecurringFuture, getTrips, getMonthStats, FuturePayment, MonthStats } from '../db';
import { Wallet, TrendingUp, TrendingDown, PiggyBank, AlertTriangle, Target, Plane } from 'lucide-react';
import { useLoc } from '../loc';

interface DashboardProps {
  config: Config;
  expenses: Expense[];
  incomes: Income[];
  // Stipendio effettivo del mese corrente (base o override mensile)
  currentSalary?: number;
}

export default function Dashboard({ config, expenses, incomes, currentSalary }: DashboardProps) {
  const loc = useLoc();
  const t = loc.t;
  // Importi del DB -> valuta attiva (tassi aggiornati ogni giorno, vedi fx.ts)
  const conv = loc.conv;
  const money = (n: number) => `${loc.symbol}${loc.fmtNum(conv(n))}`;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date();
  const [futurePayments, setFuturePayments] = useState<FuturePayment[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  // Statistiche mensili calcolate dal backend: salute finanziaria più
  // precisa e percentuali corrette (ricorrenze conteggiate per occorrenze
  // reali, accantonamenti esclusi dai consumi).
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);

  useEffect(() => {
    getRecurringFuture(12).then(setFuturePayments);
  }, [expenses]); // Ricarica quando le spese cambiano

  useEffect(() => {
    getMonthStats().then(setMonthStats).catch(() => setMonthStats(null));
  }, [expenses, incomes, config]);

  // I viaggi hanno budget/costi in valuta propria: nessuna conversione necessaria
  useEffect(() => {
    getTrips().then(setTrips).catch(() => { /* backend non raggiungibile */ });
  }, []);
  
  const stats = useMemo(() => {
    const monthExpenses = expenses.filter(e => e.date.startsWith(currentMonth));
    const isSavingsExpense = (e: { type: string; category: string }) => {
      const type = e.type?.trim().toLowerCase();
      const category = e.category?.trim().toLowerCase();
      return type === 'savings' || type === 'pac' ||
        category === 'accantonamento' || category === 'risparmio';
    };
    // Le entrate "Stipendio" sincronizzate dall'override mensile vengono
    // escluse qui: lo stipendio del mese è contato una sola volta, col
    // suo importo effettivo (base o override), per evitare doppi conteggi.
    const monthIncomes = incomes.filter(i => i.date.startsWith(currentMonth) && !i.id.startsWith('salary_'));

    // Includi le proiezioni dei pagamenti ricorrenti del mese corrente.
    // REGOLA ANTIDOPPIO: una occorrenza proiettata vale 1 nel conto solo
    // se non esiste già una spesa registrata lo stesso mese con stesso
    // description e amount (altrimenti viene contata due volte e il saldo
    // va fortemente in negativo).
    const hasRecordedTwin = (fp: FuturePayment) =>
      monthExpenses.some(e =>
        e.description === fp.description &&
        Math.abs(e.amount - fp.amount) < 0.005 &&
        e.date.slice(0, 7) === fp.date.slice(0, 7)
      );
    const monthFuturePayments = futurePayments.filter(fp =>
      fp.date.startsWith(currentMonth) && !fp.is_paid && !hasRecordedTwin(fp)
    );

    const salaryThisMonth = currentSalary ?? config.salary;
    const totalIncome = salaryThisMonth + monthIncomes.reduce((sum, i) => sum + i.amount, 0);
    const recordedExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const futureExpenses = monthFuturePayments.reduce((sum, fp) => sum + fp.amount, 0);
    const totalExpenses = recordedExpenses + futureExpenses;
    const balance = totalIncome - totalExpenses;
    
    // Days until payday
    const payday = config.payday;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let daysUntilPayday: number;
    if (today.getDate() < payday) {
      daysUntilPayday = payday - today.getDate();
    } else {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      daysUntilPayday = (payday - 1) + (daysInMonth - today.getDate() + 1);
    }
    
    // Daily spending budget
    const dailyBudget = daysUntilPayday > 0 ? balance / daysUntilPayday : 0;
    
    // Subscriptions total (incluse proiezioni future)
    const subscriptions = monthExpenses.filter(e => e.type === 'subscription');
    const futureSubscriptions = monthFuturePayments.filter(fp => fp.type === 'subscription');
    const subscriptionsTotal = subscriptions.reduce((sum, e) => sum + e.amount, 0) + 
                                futureSubscriptions.reduce((sum, fp) => sum + fp.amount, 0);
    
    // Savings + PAC (incluse proiezioni future)
    const savings = monthExpenses.filter(isSavingsExpense);
    const futureSavings = monthFuturePayments.filter(isSavingsExpense);
    const savingsAccrued = savings.reduce((sum, e) => sum + e.amount, 0) +
                           futureSavings.reduce((sum, fp) => sum + fp.amount, 0);
    const savingsTotal = (config.savings_base ?? 0) + savingsAccrued;
    
    // Category breakdown (incluse proiezioni future)
    const byCategory: Record<string, number> = {};
    monthExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    monthFuturePayments.forEach(fp => {
      byCategory[fp.category] = (byCategory[fp.category] || 0) + fp.amount;
    });
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    return {
      totalIncome,
      totalExpenses,
      balance,
      daysUntilPayday,
      dailyBudget,
      subscriptionsTotal,
      savingsTotal,
      topCategories,
      monthExpenses: monthExpenses.length + monthFuturePayments.length,
      expensePercentage: totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0,
    };
  }, [config, expenses, incomes, futurePayments, currentMonth, currentSalary]);

  const getHealthColor = () => {
    const expensePercentage = monthStats?.expenseRatio ?? stats.expensePercentage;
    if (expensePercentage < 60) return 'text-green-600';
    if (expensePercentage < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthMessage = () => {
    const expensePercentage = monthStats?.expenseRatio ?? stats.expensePercentage;
    const pct = expensePercentage.toFixed(1);
    if (expensePercentage < 60) return t('dash.health.good', { pct });
    if (expensePercentage < 80) return t('dash.health.warn', { pct });
    return t('dash.health.critical', { pct });
  };

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{t('dash.thisMonth')}</span>
          </div>
          <p className="text-sm opacity-90">{t('dash.incomes')}</p>
          <p className="text-3xl font-bold">{money(stats.totalIncome)}</p>
          <p className="text-xs opacity-70 mt-1">{t('dash.incomesSub')}</p>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <TrendingDown className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{t('expense.items', { count: stats.monthExpenses })}</span>
          </div>
          <p className="text-sm opacity-90">{t('dash.expenses')}</p>
          <p className="text-3xl font-bold">{money(stats.totalExpenses)}</p>
          <p className="text-xs opacity-70 mt-1">{(monthStats?.expenseRatio ?? stats.expensePercentage).toFixed(1)}{t('dash.ofIncomes')}</p>
        </div>
        
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <PiggyBank className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{t('dash.balance')}</span>
          </div>
          <p className="text-sm opacity-90">{t('dash.available')}</p>
          <p className="text-3xl font-bold">{money(stats.balance)}</p>
          <p className="text-xs opacity-70 mt-1">{money(stats.dailyBudget)}{t('dash.perDay')}</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <Wallet className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{t('dash.nextPayday')}</span>
          </div>
          <p className="text-sm opacity-90">{t('dash.daysLeft')}</p>
          <p className="text-3xl font-bold">{stats.daysUntilPayday}</p>
          <p className="text-xs opacity-70 mt-1">{t('dash.dayOfMonth', { day: config.payday })}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <PiggyBank className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{t('dash.savings.total')}</span>
          </div>
          <p className="text-sm opacity-90">{t('dash.savings.total')}</p>
          <p className="text-3xl font-bold">{money(monthStats?.savingsTotal ?? stats.savingsTotal)}</p>
          <p className="text-xs opacity-70 mt-1">
            {money(monthStats?.savingsBase ?? (config.savings_base ?? 0))} {t('dash.savings.base')}
          </p>
        </div>
      </div>

      {/* Health Indicator */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">{t('dash.health')}</h3>
          <span className={`text-sm font-bold ${getHealthColor()}`}>{(monthStats?.expenseRatio ?? stats.expensePercentage).toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-3">
          <div
            className={`h-4 rounded-full transition-all ${
              (monthStats?.expenseRatio ?? stats.expensePercentage) < 60 ? 'bg-green-500' :
              (monthStats?.expenseRatio ?? stats.expensePercentage) < 80 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(monthStats?.expenseRatio ?? stats.expensePercentage, 100)}%` }}
          />
        </div>
        <p className={`text-sm font-medium ${getHealthColor()}`}>{getHealthMessage()}</p>
        
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500">{t('dash.subscriptions')}</p>
            <p className="font-bold text-gray-800 dark:text-white">{money(stats.subscriptionsTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">{t('dash.savings.total')}</p>
            <p className="font-bold text-gray-800 dark:text-white">{money(monthStats?.savingsTotal ?? stats.savingsTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">{t('dash.dailyBudget')}</p>
            <p className={`font-bold ${stats.dailyBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {money(stats.dailyBudget)}
            </p>
          </div>
        </div>
      </div>

      {/* Prossimi Viaggi */}
      {trips.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Plane className="w-5 h-5 text-purple-500" />
            {t('dash.trips.title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trips.slice(0, 3).map(trip => {
              const spent = trip.spent ?? 0;
              const over = trip.budget > 0 && spent > trip.budget;
              const pct = trip.budget > 0 ? Math.min(100, (spent / trip.budget) * 100) : 0;
              return (
                <div key={trip.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm text-gray-800 dark:text-white truncate">{trip.name}</span>
                    <span className={`text-xs font-medium ${over ? 'text-red-600' : 'text-green-600'}`}>{pct.toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {loc.fmtIn(conv(spent, trip.currency), loc.currencyCode)} / {loc.fmtIn(conv(trip.budget, trip.currency), loc.currencyCode)}
                  </p>
                  <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Categories */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">{t('dash.topCategories')}</h3>
          <div className="space-y-3">
            {stats.topCategories.map(([cat, amount], idx) => {
              const pct = stats.totalExpenses > 0 ? (amount / stats.totalExpenses) * 100 : 0;
              const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-blue-500'];
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-6 text-center font-bold text-gray-400">{idx + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{cat}</span>
                      <span className="text-gray-500">{money(amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${colors[idx]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {stats.topCategories.length === 0 && (
              <p className="text-center text-gray-500 py-4">{t('dash.noExpenses')}</p>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">{t('dash.tips')}</h3>
          <div className="space-y-3">
            {(monthStats?.expenseRatio ?? stats.expensePercentage) > 80 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  {t('dash.tip.highSpend', { pct: (monthStats?.expenseRatio ?? stats.expensePercentage).toFixed(1) })}
                </p>
              </div>
            )}
            {stats.subscriptionsTotal > 0 && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  <Target className="w-4 h-4 inline mr-1" />
                  {t('dash.tip.subscriptions', { amount: money(stats.subscriptionsTotal) })} 
                </p>
              </div>
            )}
            {stats.savingsTotal === 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {t('dash.tip.noSavings')}
                </p>
              </div>
            )}
            {stats.balance > 0 && stats.expensePercentage < 70 && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {t('dash.tip.greatJob')}
                </p>
              </div>
            )}
            {stats.daysUntilPayday > 15 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {t('dash.tip.paydayFar', { days: stats.daysUntilPayday, amount: money(stats.dailyBudget) })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
