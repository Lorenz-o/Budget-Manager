import React, { useState, useEffect } from 'react';
import {
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  addExpenseCategory,
  getRecurringFuture,
  FuturePayment,
  deleteRecurringOccurrence
} from '../db';
import { Expense, ExpenseType, Category } from '../types';
import { Plus, Trash2, Edit2, Receipt, X, Check, Filter, Calendar } from 'lucide-react';
import { useLoc } from '../loc';

const EXPENSE_TYPES: { value: ExpenseType; labelKey: string; icon: string; descriptionKey: string }[] = [
  { value: 'single', labelKey: 'expenseType.single', icon: '💳', descriptionKey: 'expenseType.single.desc' },
  { value: 'subscription', labelKey: 'expenseType.subscription', icon: '🔄', descriptionKey: 'expenseType.subscription.desc' },
  { value: 'installment', labelKey: 'expenseType.installment', icon: '📋', descriptionKey: 'expenseType.installment.desc' },
  { value: 'savings', labelKey: 'expenseType.savings', icon: '🏦', descriptionKey: 'expenseType.savings.desc' },
  { value: 'pac', labelKey: 'expenseType.pac', icon: '📈', descriptionKey: 'expenseType.pac.desc' },
];

export default function ExpensesPanel({ onDataUpdate, onFormOpenChange }: { onDataUpdate: () => void; onFormOpenChange?: (open: boolean) => void }) {
  const loc = useLoc();
  const t = loc.t;
  // Importi del DB -> valuta attiva (tassi aggiornati ogni giorno, vedi fx.ts)
  const conv = loc.conv;
  const money = (n: number) => `${loc.symbol}${loc.fmtNum(conv(n))}`;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [futurePayments, setFuturePayments] = useState<FuturePayment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<ExpenseType | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ description?: string; amount?: string; date?: string; installments?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Quando il form è aperto blocca la navigazione esterna (tab/filtri)
  useEffect(() => {
    onFormOpenChange?.(showForm);
    return () => onFormOpenChange?.(false);
  }, [showForm]);
  
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Altro',
    type: 'single' as ExpenseType,
    installments: '',
    installmentsPaid: '',
    endDate: '',
    notes: '',
  });

  const loadData = async () => {
    const [exp, cats, fp] = await Promise.all([getExpenses(), getExpenseCategories(), getRecurringFuture(24)]);
    setExpenses(exp);
    setCategories(cats);
    setFuturePayments(fp);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm({
      description: '', amount: '', date: new Date().toISOString().split('T')[0],
      category: 'Altro', type: 'single', installments: '', installmentsPaid: '', endDate: '', notes: '',
    });
    setShowForm(false);
    setEditingId(null);
    setErrors({});
    setSubmitError(null);
  };

  const validate = () => {
    const newErrors: { description?: string; amount?: string; date?: string; installments?: string } = {};
    
    if (!form.description.trim()) {
      newErrors.description = t('expense.err.desc');
    }
    
    if (!form.amount || parseFloat(form.amount) <= 0) {
      newErrors.amount = t('expense.err.amount');
    }
    
    if (!form.date) {
      newErrors.date = t('expense.err.date');
    }
    
    if (form.type === 'installment') {
      if (!form.installments || parseInt(form.installments) <= 0) {
        newErrors.installments = t('expense.err.installments');
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    const expenseData = {
      description: form.description,
      amount: parseFloat(form.amount),
      date: form.date,
      category: form.category,
      type: form.type,
      installments: form.installments
        ? parseInt(form.installments)
        : undefined,
      installmentsPaid: form.installmentsPaid
        ? parseInt(form.installmentsPaid)
        : undefined,
      endDate: form.endDate || undefined,
      notes: form.notes || undefined,
    };

    try {
      if (editingId !== null) {
        await updateExpense({
          ...expenseData,
          id: editingId,
        });
      } else {
        const newId = await addExpense(expenseData);

        console.log('Nuova expense creata con ID DB:', newId);
      }
    } catch (err: any) {
      setSubmitError(err?.message || t('expense.err.save'));
      return;
    }

    const updated = await getExpenses();
    setExpenses(updated);
    try {
      setFuturePayments(await getRecurringFuture(24));
    } catch { /* ignore */ }
    resetForm();
    onDataUpdate();
  };

  const refreshFuture = async () => {
    try {
      setFuturePayments(await getRecurringFuture(24));
    } catch { /* ignore */ }
  };

  const handleEdit = (expense: Expense) => {
    setForm({
      description: expense.description,
      amount: expense.amount.toString(),
      date: expense.date,
      category: expense.category,
      type: expense.type,
      installments: expense.installments?.toString() || '',
      installmentsPaid: expense.installmentsPaid?.toString() || '',
      endDate: expense.endDate || '',
      notes: expense.notes || '',
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('expense.deleteConfirm'))) {
      await deleteExpense(id);
      const updated = await getExpenses();
      setExpenses(updated);
      refreshFuture();
      onDataUpdate();
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
      const categoryData = {
        name: newCategory.trim(),
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        icon: '📁',
      };

   try {
    const newId = await addExpenseCategory(categoryData);

    const createdCategory: Category = {
      ...categoryData,
      id: newId,
    };

    setCategories(prev => [...prev, createdCategory]);

    setForm(prev => ({
      ...prev,
      category: createdCategory.name,
    }));

    setNewCategory('');
    setShowNewCat(false);
  } catch (err: any) {
    setSubmitError(
      err?.message || 'Errore durante la creazione della categoria'
    );
  }
  };



  // Spese registrate del mese
  const recordedExpenses = expenses.filter(e => {
    const matchType = filterType === 'all' || e.type === filterType;
    const matchMonth = e.date.startsWith(filterMonth);
    return matchType && matchMonth;
  });

  // Pagamenti futuri ricorrenti del mese (proiezioni).
  // REGOLA ANTIDOPPIO: se la stessa occorrenza è già stata registrata
  // manualmente (riga con stesso description/amount nello stesso mese),
  // la proiezione non viene mostrata: ogni valore conta una sola volta.
  const monthFuturePayments = futurePayments.filter(fp => {
    const matchType = filterType === 'all' || fp.type === filterType;
    const matchMonth = fp.date.startsWith(filterMonth);
    if (!matchType || !matchMonth) return false;
    const twinRecorded = recordedExpenses.some(e =>
      e.description === fp.description &&
      Math.abs(e.amount - fp.amount) < 0.005 &&
      e.date.slice(0, 7) === fp.date.slice(0, 7)
    );
    return !twinRecorded;
  });

  // Determina il mese corrente
  const currentMonth = new Date().toISOString().slice(0, 7);
  const isCurrentOrPastMonth = filterMonth <= currentMonth;

  // Combina le spese: per mesi passati/corrente mostra solo quelle registrate
  // Per mesi futuri mostra solo le proiezioni
  // Per il mese corrente mostra entrambe (se ci sono rate ricorrenti che iniziano questo mese)
  const combinedExpenses = isCurrentOrPastMonth 
    ? [...recordedExpenses, ...monthFuturePayments]
    : monthFuturePayments;

  const filteredExpenses = combinedExpenses.sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const totalFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const getTypeBadge = (type: ExpenseType) => {
    const colors: Record<ExpenseType, string> = {
      single: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      subscription: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      installment: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      savings: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      pac: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    };
    const info = EXPENSE_TYPES.find(et => et.value === type);
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type]}`}>
        {info ? `${info.icon} ${t(info.labelKey)}` : type}
      </span>
    );
  };

const handleDeleteFuture = async (
  payment: FuturePayment
) => {
  if (
    !confirm(
      `Eliminare solo l'occorrenza del ${loc.dateLabel(payment.date)}?`
      + `\nLa ricorrenza continuerà nei mesi successivi.`
    )
  ) {
    return;
  }

  try {
    await deleteRecurringOccurrence(
      payment.original_id,
      payment.date
    );

    await refreshFuture();
    onDataUpdate();
  } catch (error: any) {
    setSubmitError(
      error?.message ||
      "Errore durante la cancellazione dell'occorrenza."
    );
  }
};


  if (loading) return <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
            <Receipt className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('expense.title')}</h2>
            <p className="text-sm text-gray-500">
              {loc.monthLabel(filterMonth)}: <span className="font-bold text-red-600">-{money(totalFiltered)}</span>
              {' '}({t('expense.items', { count: filteredExpenses.length })})
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('common.add')}
        </button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            disabled={showForm}
            title={showForm ? t('common.filterLocked') : undefined}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              return d.toISOString().slice(0, 7);
            }).map(m => (
              <option key={m} value={m}>
                {loc.monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ExpenseType | 'all')}
          disabled={showForm}
          title={showForm ? t('common.filterLocked') : undefined}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="all">{t('common.allTypes')}</option>
          {EXPENSE_TYPES.map(et => (
            <option key={et.value} value={et.value}>{et.icon} {t(et.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('common.description')}</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); if (errors.description) setErrors({...errors, description: undefined}); }}
                placeholder={t('expense.descPlaceholder')}
                className={`w-full px-3 py-2 rounded-lg border ${errors.description ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-red-500`}
              />
              {errors.description && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.description}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('common.amount')} ({loc.symbol})</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => { setForm({ ...form, amount: e.target.value }); if (errors.amount) setErrors({...errors, amount: undefined}); }}
                placeholder="0.00"
                className={`w-full px-3 py-2 rounded-lg border ${errors.amount ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-red-500`}
              />
              {errors.amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.amount}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('common.date')}</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => { setForm({ ...form, date: e.target.value }); if (errors.date) setErrors({...errors, date: undefined}); }}
                className={`w-full px-3 py-2 rounded-lg border ${errors.date ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-red-500`}
              />
              {errors.date && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.date}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('common.category')}</label>
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-red-500"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.icon} {loc.tl(c.name)}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCat(!showNewCat)}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">{t('expense.typeLabel')}</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {EXPENSE_TYPES.map(et => (
                  <button
                    key={et.value}
                    onClick={() => setForm({ ...form, type: et.value })}
                    className={`p-2 rounded-lg border-2 text-center text-xs transition ${
                      form.type === et.value
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg">{et.icon}</div>
                    <div className="font-medium">{t(et.labelKey)}</div>
                  </button>
                ))}
              </div>
            </div>

            {form.type === 'installment' && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('expense.installments.total')}</label>
                  <input
                    type="number"
                    value={form.installments}
                    onChange={(e) => { setForm({ ...form, installments: e.target.value }); if (errors.installments) setErrors({...errors, installments: undefined}); }}
                    placeholder="12"
                    className={`w-full px-3 py-2 rounded-lg border ${errors.installments ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white`}
                  />
                  {errors.installments && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.installments}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('expense.installments.paid')}</label>
                  <input
                    type="number"
                    value={form.installmentsPaid}
                    onChange={(e) => setForm({ ...form, installmentsPaid: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </>
            )}

            {form.type === 'subscription' && (
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('expense.endDate')}</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('common.notesOptional')}</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('common.notes') + '...'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
          </div>

          {showNewCat && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder={`${t('common.add')} ${t('common.category').toLowerCase()}...`}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <button onClick={handleAddCategory} className="px-3 py-2 bg-red-600 text-white rounded-lg">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setShowNewCat(false)} className="px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 font-medium">⚠️ {submitError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
            >
              {editingId ? `${t('common.update')} ${t('expense.add').toLowerCase()}` : `${t('common.add')} ${t('expense.add').toLowerCase()}`}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Lista spese */}
      <div className="space-y-3">
        {monthFuturePayments.length > 0 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <Calendar className="w-4 h-4 inline mr-1" />
              <strong>{t('expense.infoTitle')}</strong> {t('expense.infoBody')}
            </p>
          </div>
        )}
        
        {filteredExpenses.length === 0 && (
          <p className="text-center text-gray-500 py-8">{t('expense.empty')}</p>
        )}
        {filteredExpenses.map(expense => {
          // Verifica se è una proiezione futura
          const isFuturePayment = 'is_future' in expense && expense.is_future;
          
          return (
            <div 
              key={expense.id} 
              className={`flex items-center justify-between p-4 rounded-xl hover:shadow-md transition ${
                isFuturePayment 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                  : 'bg-gray-50 dark:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {categories.find(c => c.name === expense.category)?.icon || '📦'}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 dark:text-white">{expense.description}</p>
                    {isFuturePayment && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {t('expense.projection')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{loc.tl(expense.category)} • {loc.dateLabel(expense.date)}</span>
                    {getTypeBadge(expense.type as ExpenseType)}
                    {!isFuturePayment && expense.type === 'installment' && (expense as Expense).installments && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        {t('expense.rate')} {(expense as Expense).installmentsPaid || 0}/{(expense as Expense).installments}
                      </span>
                    )}
                    {isFuturePayment && (expense as FuturePayment).total_occurrences && (
                      <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        {t('expense.rate')} {(expense as FuturePayment).occurrence}/{(expense as FuturePayment).total_occurrences}
                        {(expense as FuturePayment).is_paid && (
                          <span className="ml-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            {t('expense.paid')}
                          </span>
                        )}
                        {!(expense as FuturePayment).is_paid && (
                          <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                            {t('expense.pending')}
                          </span>
                        )}
                      </span>
                    )}
                    {isFuturePayment && (
                      <button
                        onClick={() =>
                          handleDeleteFuture(expense as FuturePayment)
                        }
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition"
                        title="Elimina solo questa occorrenza"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {expense.notes && <p className="text-xs text-gray-400 mt-1 italic">{expense.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-red-600 text-lg">-{money(expense.amount)}</span>
                {!isFuturePayment && (
                  <>
                    <button onClick={() => handleEdit(expense as Expense)} className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete((expense as Expense).id)} className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
