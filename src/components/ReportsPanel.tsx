import React, { useState, useEffect, useMemo } from 'react';
import { getConfig, getExpenses, getIncomes, getRecurringFuture, getHealthReport, FuturePayment, HealthReport } from '../db';
import { Expense, Income, Config, ExpenseType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, PiggyBank, ArrowUpDown, HeartPulse, Download } from 'lucide-react';
import { useLoc } from '../loc';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#84cc16', '#6b7280'];

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  single: 'Singola',
  subscription: 'Abbonamento',
  installment: 'Rata',
  savings: 'Accantonamento',
  pac: 'PAC',
};

export default function ReportsPanel() {
  const loc = useLoc();
  const t = loc.t;
  const [config, setConfig] = useState<Config>({ payday: 27, salary: 0, currency: '€' });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [futurePayments, setFuturePayments] = useState<FuturePayment[]>([]);
  const [selectedMonths, setSelectedMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  // Report salute finanziaria (calcolato dal backend, mese per mese)
  const [health, setHealth] = useState<HealthReport | null>(null);

  useEffect(() => {
    Promise.all([getConfig(), getExpenses(), getIncomes(), getRecurringFuture(12)]).then(([c, e, i, fp]) => {
      setConfig(c);
      setExpenses(e);
      setIncomes(i);
      setFuturePayments(fp);
      setLoading(false);
    });
  }, []);

  // Ricarica il report quando cambia il periodo selezionato o la configurazione
  useEffect(() => {
    getHealthReport(selectedMonths)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [selectedMonths, config]);

  const monthlyData = useMemo(() => {
    const months: { month: string; label: string; income: number; expenses: number; balance: number; byCategory: Record<string, number>; byType: Record<ExpenseType, number>; isProjected: boolean }[] = [];
    
    const today = new Date();
    const currentMonthKey = today.toISOString().slice(0, 7);
    
    for (let i = selectedMonths - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
      
      // Determina se il mese è futuro
      const isProjected = monthKey > currentMonthKey;
      
      const salary = config.salary;
      const extraIncomes = incomes
        .filter(inc => inc.date.startsWith(monthKey))
        .reduce((sum, inc) => sum + inc.amount, 0);
      const totalIncome = salary + extraIncomes;

      // Spese registrate
      const monthExpenses = expenses.filter(e => e.date.startsWith(monthKey));
      
      // Spese future ricorrenti (solo per mesi futuri).
      // REGOLA ANTIDOPPIO: occorrenze già registrate manualmente nello
      // stesso mese (stesso description/amount) non vengono ri-contate.
      const monthFuturePayments = isProjected 
        ? futurePayments.filter(fp => {
            if (!fp.date.startsWith(monthKey)) return false;
            const twinRecorded = monthExpenses.some(e =>
              e.description === fp.description &&
              Math.abs(e.amount - fp.amount) < 0.005 &&
              e.date.slice(0, 7) === fp.date.slice(0, 7)
            );
            return !twinRecorded;
          })
        : [];
      
      // Calcola totale spese
      const recordedExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
      const futureExpenses = monthFuturePayments.reduce((sum, fp) => sum + fp.amount, 0);
      const totalExpenses = recordedExpenses + futureExpenses;

      // Per categoria (combina spese registrate e future)
      const byCategory: Record<string, number> = {};
      monthExpenses.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });
      monthFuturePayments.forEach(fp => {
        byCategory[fp.category] = (byCategory[fp.category] || 0) + fp.amount;
      });

      // Per tipo
      const byType: Record<ExpenseType, number> = { single: 0, subscription: 0, installment: 0, savings: 0, pac: 0 };
      monthExpenses.forEach(e => {
        byType[e.type] += e.amount;
      });
      monthFuturePayments.forEach(fp => {
        byType[fp.type as ExpenseType] = (byType[fp.type as ExpenseType] || 0) + fp.amount;
      });

      months.push({ month: monthKey, label, income: totalIncome, expenses: totalExpenses, balance: totalIncome - totalExpenses, byCategory, byType, isProjected });
    }
    return months;
  }, [expenses, incomes, futurePayments, config, selectedMonths]);

  if (loading) return <div className="p-6 text-center text-gray-500">Caricamento report...</div>;

  const currentMonth = monthlyData[monthlyData.length - 1];
  const previousMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
  const balanceChange = previousMonth ? currentMonth.balance - previousMonth.balance : 0;

  const pieData = Object.entries(currentMonth?.byCategory || {}).map(([name, value]) => ({ name, value }));

  const typeData = Object.entries(currentMonth?.byType || {})
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name: EXPENSE_TYPE_LABELS[name as ExpenseType], value }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Entrate Mese</span>
          </div>
          <p className="text-2xl font-bold text-green-600">€{currentMonth?.income.toFixed(2) || '0.00'}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm text-gray-500">Spese Mese</span>
          </div>
          <p className="text-2xl font-bold text-red-600">€{currentMonth?.expenses.toFixed(2) || '0.00'}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <PiggyBank className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Saldo</span>
          </div>
          <p className={`text-2xl font-bold ${(currentMonth?.balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            €{currentMonth?.balance.toFixed(2) || '0.00'}
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${balanceChange >= 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
              <ArrowUpDown className={`w-5 h-5 ${balanceChange >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <span className="text-sm text-gray-500">vs Mese Prec.</span>
          </div>
          <p className={`text-2xl font-bold ${balanceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {balanceChange >= 0 ? '+' : ''}€{balanceChange.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Periodo:</label>
        <select
          value={selectedMonths}
          onChange={(e) => setSelectedMonths(parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
        >
          <option value={3}>3 mesi</option>
          <option value={6}>6 mesi</option>
          <option value={12}>12 mesi</option>
        </select>
      </div>

      {/* Bar Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">📊 Entrate vs Spese Mensili</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} formatter={(value: number) => [`€${value.toFixed(2)}`, '']} />
            <Legend />
            <Bar dataKey="income" name="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Spese" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">📈 Andamento Saldo</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} formatter={(value: number) => [`€${value.toFixed(2)}`, 'Saldo']} />
            <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">🥧 Spese per Categoria</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(value: number) => [`€${value.toFixed(2)}`, '']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (<p className="text-center text-gray-500 py-12">Nessun dato disponibile</p>)}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">📋 Spese per Tipo</h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {typeData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[(index + 5) % COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(value: number) => [`€${value.toFixed(2)}`, '']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (<p className="text-center text-gray-500 py-12">Nessun dato disponibile</p>)}
        </div>
      </div>

      {/* Monthly Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">📅 Dettaglio Mensile</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          I mesi evidenziati in azzurro sono <span className="text-blue-500 font-medium">proiezioni</span> basate sui pagamenti ricorrenti futuri (abbonamenti, rate, PAC, accantonamenti)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Mese</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Entrate</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Spese</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Saldo</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">% Spese/Entrate</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map(m => (
                <tr key={m.month} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${m.isProjected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                  <td className="py-3 px-4 font-medium text-gray-800 dark:text-white capitalize">
                    {m.label}
                    {m.isProjected && <span className="ml-2 text-xs text-blue-500 font-normal">(proiezione)</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-green-600">€{m.income.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-red-600">€{m.expenses.toFixed(2)}</td>
                  <td className={`py-3 px-4 text-right font-bold ${m.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>€{m.balance.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">{m.income > 0 ? ((m.expenses / m.income) * 100).toFixed(1) : '0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
