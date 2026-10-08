import React, { useState, useEffect } from 'react';
import {
  getIncomes,
  addIncome,
  updateIncome,
  deleteIncome,
  getIncomeCategories,
  addIncomeCategory
} from '../db';import { Income, Category } from '../types';
import { Plus, Trash2, Edit2, TrendingUp, X, Check } from 'lucide-react';

export default function IncomePanel({ onDataUpdate, onFormOpenChange }: { onDataUpdate: () => void; onFormOpenChange?: (open: boolean) => void }) {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Altro',
  });
  const [newCategory, setNewCategory] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ description?: string; amount?: string; date?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Quando il form è aperto blocca la navigazione esterna (tab)
  useEffect(() => {
    onFormOpenChange?.(showForm);
    return () => onFormOpenChange?.(false);
  }, [showForm]);

  // Data massima di oggi: le entrate non possono essere future
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    Promise.all([getIncomes(), getIncomeCategories()]).then(([inc, cats]) => {
      setIncomes(inc);
      setCategories(cats);
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0], category: 'Altro' });
    setShowForm(false);
    setEditingId(null);
    setErrors({});
    setSubmitError(null);
  };

  const validate = () => {
    const newErrors: { description?: string; amount?: string; date?: string } = {};
    
    if (!form.description.trim()) {
      newErrors.description = '⚠️ Inserisci una descrizione per l\'entrata';
    }
    
    if (!form.amount || parseFloat(form.amount) <= 0) {
      newErrors.amount = '⚠️ Inserisci un importo valido maggiore di 0';
    }
    
    if (!form.date) {
      newErrors.date = '⚠️ Seleziona una data';
    } else if (form.date > todayStr) {
      newErrors.date = '⚠️ Le entrate vanno suddivise per mese: non puoi registrarle per un mese futuro';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const incomeData = {
      description: form.description,
      amount: parseFloat(form.amount),
      date: form.date,
      category: form.category,
      recurring: false,
    };

    try {
      if (editingId !== null) {
        await updateIncome({
          ...incomeData,
          id: editingId,
        });
      } else {
        const newId = await addIncome(incomeData);

        console.log('Nuova entrata creata con ID DB:', newId);
      }
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Errore durante il salvataggio dell\'entrata'
      );
      return;
    }

    const updated = await getIncomes();
    setIncomes(updated);
    resetForm();
    onDataUpdate();
  };
  const handleEdit = (income: Income) => {
    setForm({
      description: income.description,
      amount: income.amount.toString(),
      date: income.date,
      category: income.category,
    });
    setEditingId(income.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Eliminare questa entrata?')) {
      await deleteIncome(id);
      const updated = await getIncomes();
      setIncomes(updated);
      onDataUpdate();
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    const categoryData = {
      name: newCategory.trim(),
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      icon: '💎',
    };

    try {
      const newId = await addIncomeCategory(categoryData);

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

  const totalMonth = incomes.reduce((sum, i) => {
    const d = new Date(i.date);
    const now = new Date();
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      return sum + i.amount;
    }
    return sum;
  }, 0);

  if (loading) return <div className="p-6 text-center text-gray-500">Caricamento...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
            <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Entrate Extra</h2>
            <p className="text-sm text-gray-500">Questo mese: <span className="font-bold text-green-600">€{totalMonth.toFixed(2)}</span></p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Aggiungi
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Descrizione</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); if (errors.description) setErrors({...errors, description: undefined}); }}
                placeholder="Es. Vendita carte Pokemon"
                className={`w-full px-3 py-2 rounded-lg border ${errors.description ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-green-500`}
              />
              {errors.description && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.description}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => { setForm({ ...form, amount: e.target.value }); if (errors.amount) setErrors({...errors, amount: undefined}); }}
                placeholder="0.00"
                className={`w-full px-3 py-2 rounded-lg border ${errors.amount ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-green-500`}
              />
              {errors.amount && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.amount}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Data</label>
              <input
                type="date"
                value={form.date}
                max={todayStr}
                onChange={(e) => { setForm({ ...form, date: e.target.value }); if (errors.date) setErrors({...errors, date: undefined}); }}
                className={`w-full px-3 py-2 rounded-lg border ${errors.date ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-green-500`}
              />
              {errors.date && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.date}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Categoria</label>
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-green-500"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCat(!showNewCat)}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition"
                  title="Aggiungi categoria"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {showNewCat && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nuova categoria..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <button onClick={handleAddCategory} className="px-3 py-2 bg-green-600 text-white rounded-lg">
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
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
            >
              {editingId ? 'Aggiorna' : 'Aggiungi'} Entrata
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista entrate */}
      <div className="space-y-3">
        {incomes.length === 0 && (
          <p className="text-center text-gray-500 py-8">Nessuna entrata extra registrata. Clicca "Aggiungi" per iniziare!</p>
        )}
        {[...incomes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(income => (
          <div key={income.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {categories.find(c => c.name === income.category)?.icon || '💰'}
              </span>
              <div>
                <p className="font-medium text-gray-800 dark:text-white">{income.description}</p>
                <p className="text-xs text-gray-500">{income.category} • {new Date(income.date).toLocaleDateString('it-IT')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-green-600 text-lg">+€{income.amount.toFixed(2)}</span>
              <button onClick={() => handleEdit(income)} className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(income.id)} className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
