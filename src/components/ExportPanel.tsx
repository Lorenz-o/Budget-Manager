import React, { useState, useEffect } from 'react';
import { getExpenses, getIncomes, getConfig, exportAllData, importAllData, getDBStats } from '../db';
import { Expense, Income, Config } from '../types';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Calendar, Database, Upload, HardDrive } from 'lucide-react';

export default function ExportPanel() {
  type ExportPeriod = 'current' | '3' | '6' | '12' | 'all';
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>('current');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [config, setConfig] = useState<Config>({ payday: 27, salary: 0, currency: '€' });
  const [dbStats, setDbStats] = useState<{ totalIncomes: number; totalExpenses: number; totalCategories: number; dbSize: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getExpenses(), getIncomes(), getConfig(), getDBStats()]).then(([e, i, c, s]) => {
      setExpenses(e);
      setIncomes(i);
      setConfig(c);
      setDbStats(s);
      setLoading(false);
    });
  }, []);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allMonths = Array.from(new Set([
    ...expenses.map((e: Expense) => e.date.slice(0, 7)),
    ...incomes.map((i: Income) => i.date.slice(0, 7)),
    currentMonth,
  ])).sort().reverse();

  const recentMonths = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

  const selectedMonths = exportPeriod === 'all'
    ? allMonths
    : recentMonths(exportPeriod === 'current' ? 1 : Number(exportPeriod));

  const periodLabels: Record<ExportPeriod, string> = {
    current: 'Mese corrente',
    '3': 'Ultimi 3 mesi',
    '6': 'Ultimi 6 mesi',
    '12': 'Ultimo anno',
    all: 'Da sempre',
  };

  const periodFileNames: Record<ExportPeriod, string> = {
    current: 'mese-corrente',
    '3': 'ultimi-3-mesi',
    '6': 'ultimi-6-mesi',
    '12': 'ultimo-anno',
    all: 'da-sempre',
  };

  const exportToExcel = () => {
    if (selectedMonths.length === 0) {
      alert('Seleziona almeno un mese da esportare!');
      return;
    }

    const wb = XLSX.utils.book_new();

    const summaryData = selectedMonths.map(month => {
      const monthExpenses = expenses.filter((e: Expense) => e.date.startsWith(month));
      const monthIncomes = incomes.filter((i: Income) => i.date.startsWith(month));
      const totalExpenses = monthExpenses.reduce((sum: number, e: Expense) => sum + e.amount, 0);
      const totalIncomes = config.salary + monthIncomes.reduce((sum: number, i: Income) => sum + i.amount, 0);
      
      return {
        'Mese': new Date(month + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
        'Stipendio': config.salary,
        'Entrate Extra': monthIncomes.reduce((sum: number, i: Income) => sum + i.amount, 0),
        'Totale Entrate': totalIncomes,
        'Totale Spese': totalExpenses,
        'Saldo': totalIncomes - totalExpenses,
        'N° Spese': monthExpenses.length,
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Riepilogo');

    const filteredExpenses = expenses
      .filter((e: Expense) => selectedMonths.includes(e.date.slice(0, 7)))
      .map((e: Expense) => ({
        'Data': new Date(e.date).toLocaleDateString('it-IT'),
        'Descrizione': e.description,
        'Importo (€)': e.amount,
        'Categoria': e.category,
        'Tipo': e.type === 'single' ? 'Singola' : e.type === 'subscription' ? 'Abbonamento' : e.type === 'installment' ? 'Rata' : e.type === 'savings' ? 'Accantonamento' : 'PAC',
        'Note': e.notes || '',
      }));
    const ws2 = XLSX.utils.json_to_sheet(filteredExpenses);
    XLSX.utils.book_append_sheet(wb, ws2, 'Spese');

    const filteredIncomes = incomes
      .filter((i: Income) => selectedMonths.includes(i.date.slice(0, 7)))
      .map((i: Income) => ({
        'Data': new Date(i.date).toLocaleDateString('it-IT'),
        'Descrizione': i.description,
        'Importo (€)': i.amount,
        'Categoria': i.category,
      }));
    const ws3 = XLSX.utils.json_to_sheet(filteredIncomes);
    XLSX.utils.book_append_sheet(wb, ws3, 'Entrate');

    selectedMonths.forEach(month => {
      const monthExpenses = expenses.filter((e: Expense) => e.date.startsWith(month));
      const byCategory: Record<string, number> = {};
      monthExpenses.forEach((e: Expense) => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });
      
      const totalExp = monthExpenses.reduce((s: number, e: Expense) => s + e.amount, 0);
      const catData = Object.entries(byCategory).map(([cat, amount]) => ({
        'Categoria': cat,
        'Totale (€)': amount,
        '% sul Totale': totalExp > 0 ? ((amount / totalExp) * 100).toFixed(1) + '%' : '0%',
      }));
      
      if (catData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(catData);
        const sheetName = `Cat. ${month}`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
      }
    });

    const fileName = `MyBudget_${periodFileNames[exportPeriod]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportDB = async () => {
    const data = await exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MyBudget_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportDB = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!confirm('⚠️ ATTENZIONE: Questa operazione sovrascriverà TUTTI i dati attuali con quelli del backup. Continuare?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        await importAllData(content);
        alert('✅ Backup importato con successo! Ricarica la pagina per vedere i dati.');
        window.location.reload();
      } catch (err) {
        alert('❌ Errore durante l\'importazione. File non valido.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Caricamento...</div>;

  return (
    <div className="space-y-6">
      {/* DB Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
            <Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Database SQLite</h2>
            <p className="text-sm text-gray-500">I tuoi dati sono salvati in un file .db sul tuo PC</p>
          </div>
        </div>

        {dbStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
              <p className="text-xs text-gray-500">Entrate</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white">{dbStats.totalIncomes}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
              <p className="text-xs text-gray-500">Spese</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white">{dbStats.totalExpenses}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
              <p className="text-xs text-gray-500">Categorie</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white">{dbStats.totalCategories}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
              <p className="text-xs text-gray-500">Dimensione DB</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white">{dbStats.dbSize}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportDB}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition flex items-center gap-2"
          >
            <HardDrive className="w-4 h-4" />
            Backup Completo (JSON)
          </button>
          <label className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Ripristina Backup
            <input type="file" accept=".json" onChange={handleImportDB} className="hidden" />
          </label>
        </div>

        {dbStats && 'dbPath' in dbStats && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">📁 Percorso database:</p>
            <code className="text-xs text-gray-700 dark:text-gray-300 break-all">{(dbStats as any).dbPath}</code>
          </div>
        )}

        <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            <strong>💡 Suggerimento:</strong> Il database è un file <code>mybudget.db</code> sul tuo PC. 
            Fai regolarmente un backup JSON per sicurezza. Puoi anche copiare direttamente il file .db!
          </p>
        </div>
      </div>

      {/* Export Excel */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Esporta in Excel</h2>
            <p className="text-sm text-gray-500">Scarica un report dettagliato in formato .xlsx</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Periodo da esportare:
            </label>
            <span className="text-xs text-gray-500">
              {periodLabels[exportPeriod]} · {selectedMonths.length} {selectedMonths.length === 1 ? 'mese' : 'mesi'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {(Object.keys(periodLabels) as ExportPeriod[]).map(period => (
              <button
                key={period}
                onClick={() => setExportPeriod(period)}
                className={`min-w-0 px-3 py-3 rounded-xl text-sm font-semibold transition border ${
                  exportPeriod === period
                    ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-emerald-300'
                }`}
              >
                {periodLabels[period]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {selectedMonths.map(month => (
              <span key={month} className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300">
                {new Date(month + '-01').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl mb-4">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            <strong>📊 Il file Excel includerà:</strong> {periodLabels[exportPeriod]}
          </p>
          <ul className="text-sm text-emerald-600 dark:text-emerald-400 mt-2 space-y-1 list-disc list-inside">
            <li>Foglio "Riepilogo" con totale entrate/spese/saldo per mese</li>
            <li>Foglio "Spese" con tutte le spese dettagliate</li>
            <li>Foglio "Entrate" con tutte le entrate extra</li>
            <li>Fogli separati per categoria per ogni mese selezionato</li>
          </ul>
        </div>

        <button
          onClick={exportToExcel}
          className="px-6 py-3 font-medium rounded-xl transition flex items-center gap-2 shadow-md bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg"
        >
          <Download className="w-5 h-5" />
          Scarica Excel — {periodLabels[exportPeriod]}
        </button>
      </div>
    </div>
  );
}
