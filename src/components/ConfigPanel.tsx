import React, { useState, useEffect, useCallback } from 'react';
import { getConfig, saveConfig, getSalaryMonths, setSalaryOverride, getExpenses } from '../db';
import { Config, SalaryMonth } from '../types';
import { Settings, Calendar, History, RotateCcw, Globe, Coins, PiggyBank } from 'lucide-react';
import { useLoc } from '../loc';
import { LANGUAGES, storeLang, type Lang } from '../i18n';
import { CURRENCIES, currencyName, normalizeCurrency } from '../currencies';

export default function ConfigPanel({ onConfigChange }: { onConfigChange: (c: Config) => void }) {
  const loc = useLoc();
  const t = loc.t;
  const [config, setConfig] = useState<Config>({ payday: 27, salary: 0, currency: 'EUR', language: 'it', savings_base: 0 });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ payday?: string; salary?: string }>({});
  // Risparmi di base: anteprima degli accantonamenti (savings/PAC) che
  // partiranno dal primo stipendio del mese corrente e andranno a "riempire"
  // il totale dei risparmi.
  const [recurringSavings, setRecurringSavings] = useState<number>(0);
  // Stipendio mensile personalizzato: override valido SOLO per il mese
  // scelto, senza toccare il valore base. Menu a tendina con i mesi
  // DA QUELLO CORRENTE IN AVANTI (i mesi passati non si contano).
  const [salaryMonths, setSalaryMonths] = useState<SalaryMonth[]>([]);
  const [monthEdits, setMonthEdits] = useState<Record<string, string>>({});
  const [monthSaved, setMonthSaved] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const thisMonth = new Date().toISOString().slice(0, 7);

  const applyMonths = (months: SalaryMonth[]) => {
    setSalaryMonths(months);
    const edits: Record<string, string> = {};
    months.forEach(m => {
      edits[m.month] = (m.override ?? m.baseSalary).toString();
    });
    setMonthEdits(edits);
    setSelectedMonth(prev => {
      if (prev && months.some(m => m.month === prev)) return prev;
      const cur = months.find(m => m.month === thisMonth);
      return (cur ?? months[0])?.month ?? '';
    });
  };

  const loadSalaryMonths = useCallback(() => {
    getSalaryMonths(12, { from: 'current', direction: 'future' })
      .then(applyMonths)
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      getConfig(),
      getSalaryMonths(12, { from: 'current', direction: 'future' }),
      getExpenses().catch(() => []),
    ]).then(([c, months, expenses]) => {
      setConfig({ ...c, currency: normalizeCurrency(c.currency), language: c.language === 'en' ? 'en' : 'it' });
      applyMonths(months);
      // Accantonamenti (savings/PAC) ricorrenti che partono dal primo
      // stipendio del mese corrente o prima: "riempiono" i risparmi.
      const firstPayday = `${thisMonth}-${String(Math.min(c.payday || 27, 31)).padStart(2, '0')}`;
      const tot = expenses
        .filter(e => (e.type === 'savings' || e.type === 'pac') && e.date <= `${firstPayday}T23:59:59.999Z`)
        .reduce((sum, e) => sum + e.amount, 0);
      setRecurringSavings(tot);
      setLoading(false);
    });
  }, []);

  // Applica lingua/valuta subito al salvataggio, così l'intera UI
  // (menu incluso) si aggiorna senza dover ricaricare la pagina.
  const applyRuntimePrefs = (c: Config) => {
    storeLang((c.language === 'en' ? 'en' : 'it') as Lang);
    onConfigChange(c);
  };

  const handleSaveMonth = async (month: string) => {
    const raw = monthEdits[month];
    if (raw === undefined || raw === '') return;
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) return;
    await setSalaryOverride(month, amount);
    setMonthSaved(month);
    setTimeout(() => setMonthSaved(null), 2000);
    loadSalaryMonths();
    applyRuntimePrefs(config);
  };

  const handleResetMonth = async (month: string) => {
    await setSalaryOverride(month, null);
    setMonthSaved(month);
    setTimeout(() => setMonthSaved(null), 2000);
    loadSalaryMonths();
    applyRuntimePrefs(config);
  };

  const validate = () => {
    const newErrors: { payday?: string; salary?: string } = {};

    if (!config.payday || config.payday < 1 || config.payday > 31) {
      newErrors.payday = t('config.payday.error');
    }

    if (config.salary < 0) {
      newErrors.salary = t('config.salary.error.negative');
    } else if (config.salary === 0) {
      newErrors.salary = t('config.salary.error.zero');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    await saveConfig(config);
    applyRuntimePrefs(config);
    setSaved(true);
    setErrors({});
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>;

  const curSym = loc.symbol;
  const selectedEntry = salaryMonths.find(m => m.month === selectedMonth);
  const selectedBase = selectedEntry ? selectedEntry.baseSalary : config.salary;
  const selectedHasOverride = !!selectedEntry && selectedEntry.override !== null && selectedEntry.override !== undefined;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
          <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('config.title')}</h2>
      </div>

      {/* Lingua e Valuta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Globe className="w-4 h-4" />
            {t('config.language')}
          </label>
          <select
            value={config.language ?? 'it'}
            onChange={(e) => setConfig({ ...config, language: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('config.language.help')}</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Coins className="w-4 h-4" />
            {t('config.currency')}
          </label>
          <select
            value={normalizeCurrency(config.currency)}
            onChange={(e) => setConfig({ ...config, currency: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          >
            {[...CURRENCIES]
              .sort((a, b) => currencyName(a.code, loc.lang).localeCompare(currencyName(b.code, loc.lang)))
              .map(c => (
                <option key={c.code} value={c.code}>
                  {currencyName(c.code, loc.lang)} ({c.symbol})
                </option>
              ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{t('config.currency.help')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Calendar className="w-4 h-4" />
            {t('config.payday')}
          </label>
          <input
            type="number"
            min="1"
            max="31"
            value={config.payday}
            onChange={(e) => setConfig({ ...config, payday: parseInt(e.target.value) || 1 })}
            className={`w-full px-4 py-3 rounded-xl border ${errors.payday ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
          />
          {errors.payday && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.payday}</p>
          )}
          {!errors.payday && <p className="text-xs text-gray-500 mt-1">{t('config.payday.help')}</p>}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Coins className="w-4 h-4" />
            {t('config.salary')} ({curSym})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.salary}
            onChange={(e) => setConfig({ ...config, salary: parseFloat(e.target.value) || 0 })}
            className={`w-full px-4 py-3 rounded-xl border ${errors.salary ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'} text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
          />
          {errors.salary && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.salary}</p>
          )}
          {!errors.salary && <p className="text-xs text-gray-500 mt-1">{t('config.salary.help')}</p>}
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <PiggyBank className="w-4 h-4" />
            {t('config.savingsBase')} ({curSym})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.savings_base ?? 0}
            onChange={(e) => setConfig({ ...config, savings_base: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          <p className="text-xs text-gray-500 mt-1">{t('config.savingsBase.help')}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition shadow-md hover:shadow-lg"
        >
          {t('config.saveButton')}
        </button>
        {saved && (
          <span className="text-green-600 dark:text-green-400 font-medium animate-pulse">
            {t('common.saved')}
          </span>
        )}
      </div>

      {/* Stipendio per singolo mese: menu a tendina con i mesi da quello
          corrente in avanti + input importo + salva/ripristina */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-1">
          <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">{t('config.monthlySalary.title')}</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {t('config.monthlySalary.help')}
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 capitalize"
          >
            {salaryMonths.map(m => (
              <option key={m.month} value={m.month}>
                {loc.monthLabel(m.month)}{m.month === thisMonth ? ' · ' + t('config.monthlySalary.now') : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            value={monthEdits[selectedMonth] ?? ''}
            placeholder={`${curSym}${loc.fmtNum(selectedBase)}`}
            onChange={(e) => setMonthEdits({ ...monthEdits, [selectedMonth]: e.target.value })}
            className="w-36 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">
            {selectedHasOverride ? t('config.monthlySalary.baseOf', { amount: `${curSym}${loc.fmtNum(selectedBase)}` }) : ''}
          </span>
          <button
            onClick={() => handleSaveMonth(selectedMonth)}
            disabled={!selectedMonth || monthEdits[selectedMonth] === '' || monthEdits[selectedMonth] === undefined}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
            {t('common.save')}
          </button>
          {selectedHasOverride && (
            <button
              onClick={() => handleResetMonth(selectedMonth)}
              title={t('config.monthlySalary.reset')}
              className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-blue-600 transition">
              <RotateCcw className="w-3.5 h-3.5" />
              {t('config.monthlySalary.reset')}
            </button>
          )}
          {monthSaved === selectedMonth && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t('common.savedShort')}</span>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>💡 {t('common.tip')}:</strong> {t('config.tip.salary')}
        </p>
      </div>
    </div>
  );
}
