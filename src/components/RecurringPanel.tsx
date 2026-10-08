import React, { useState, useEffect } from 'react';
import { getRecurringFuture, FuturePayment, deleteRecurringMonth } from '../db';
import { Calendar, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useLoc } from '../loc';

const TYPE_META: Record<string, { labelKey: string; cls: string }> = {
  subscription: { labelKey: 'expenseType.subscription', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  installment: { labelKey: 'expenseType.installment', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  savings: { labelKey: 'expenseType.savings', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  pac: { labelKey: 'expenseType.pac', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
};

export default function RecurringPanel() {
  const loc = useLoc();
  const t = loc.t;
  const money = (n: number) => `${loc.symbol}${loc.fmtNum(n)}`;
  const [futurePayments, setFuturePayments] = useState<FuturePayment[]>([]);
  const [monthsAhead, setMonthsAhead] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Mesi collassati (header cliccabile per una vista più compatta)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPayments();
  }, [monthsAhead]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const payments = await getRecurringFuture(monthsAhead);
      setFuturePayments(payments);
      setError(null);
    } catch (error) {
      console.error('Errore caricamento pagamenti futuri:', error);
      setError(String(error));
    }
    setLoading(false);
  };

  // Raggruppa pagamenti per mese (YYYY-MM)
  const paymentsByMonth = futurePayments.reduce((acc, payment) => {
    const month = payment.date.substring(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(payment);
    return acc;
  }, {} as Record<string, FuturePayment[]>);

  const sortedMonths = Object.keys(paymentsByMonth).sort();
  const totalAmount = futurePayments.reduce((sum, p) => sum + p.amount, 0);

  const monthLabel = (m: string) => loc.monthLabel(m);

const handleDeleteMonth = async (month: string) => {
    if (
      !confirm(
        `Eliminare tutte le spese previste di ${month}?`
        + `\nLe ricorrenze originali continueranno nei mesi successivi.`
      )
    ) {
      return;
    }

    try {
      await deleteRecurringMonth(month);
      await loadPayments();
    } catch (error) {
      setError(String(error));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        {t('recurring.loading')}
      </div>
    );
  }

  if (futurePayments.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
          {t('recurring.emptyTitle')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('recurring.emptyBody')}
        </p>
        {error && (
          <div className="mt-4 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 inline-block">
            {t('recurring.loadError')}: {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header compatto con filtri e statistiche in linea */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 mr-auto">
          <Calendar className="w-5 h-5 text-blue-500" />
          <h2 className="text-base font-bold text-gray-800 dark:text-white">{t('recurring.title')}</h2>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {t('recurring.horizon')}
          <select
            value={monthsAhead}
            onChange={(e) => setMonthsAhead(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value={3}>{t('recurring.months', { n: 3 })}</option>
            <option value={6}>{t('recurring.months', { n: 6 })}</option>
            <option value={12}>{t('recurring.months', { n: 12 })}</option>
            <option value={24}>{t('recurring.months', { n: 24 })}</option>
          </select>
        </label>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-bold text-blue-600 dark:text-blue-400">{futurePayments.length}</span> {t('recurring.payments')}
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {t('recurring.total')} <span className="font-bold text-red-600 dark:text-red-400">{money(totalAmount)}</span>
          </span>
          <span className="hidden md:inline text-gray-500 dark:text-gray-400">
            {t('recurring.average')} <span className="font-bold text-purple-600 dark:text-purple-400">{money(totalAmount / Math.max(sortedMonths.length, 1))}</span>{t('recurring.perMonth')}
          </span>
        </div>
      </div>

      {/* Timeline mensile compatta */}
      {sortedMonths.map((month) => {
        const items = paymentsByMonth[month];
        const monthTotal = items.reduce((sum, p) => sum + p.amount, 0);
        const isCollapsed = !!collapsed[month];
        return (
          <div key={month} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            {/* Header mese */}
            <div className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">

              {/* Pulsante apertura/chiusura */}
              <button
                onClick={() => setCollapsed({ ...collapsed, [month]: !isCollapsed })}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}

                <span className="text-sm font-bold text-gray-800 dark:text-white capitalize w-28 flex-shrink-0">
                  {monthLabel(month)}
                </span>

                <span className="text-xs text-gray-400 flex-1">
                  {items.length === 1
                    ? t('recurring.countOne')
                    : t('recurring.count', { n: items.length })}
                </span>

                <span className="text-sm font-bold text-red-600 dark:text-red-400 flex-shrink-0">
                  -{money(monthTotal)}
                </span>
              </button>

              {/* QUESTO è il pulsante cestino */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteMonth(month);
                }}
                title="Elimina tutte le spese previste di questo mese"
                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>

            </div>
            {/* Righe pagamenti (compatte) */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {items.map((payment) => {
                  const m = TYPE_META[payment.type];
                  const label = m ? t(m.labelKey) : payment.type;
                  const cls = m ? m.cls : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                  return (
                    <div key={payment.id} className="flex items-center gap-3 px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-sm">
                      <span className="w-12 flex-shrink-0 text-xs text-gray-400 tabular-nums">
                        {loc.dayMonthLabel(payment.date)}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium text-gray-800 dark:text-gray-200">
                        {payment.description}
                        {payment.total_occurrences && (
                          <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                            {payment.occurrence}/{payment.total_occurrences}
                          </span>
                        )}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
                          {label}
                        </span>
                        {payment.category && (
                          <span className="ml-2 text-xs text-gray-400 hidden lg:inline">• {payment.category}</span>
                        )}
                      </span>
                      {payment.is_paid ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex-shrink-0">✓</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded flex-shrink-0">⏳</span>
                      )}
                      <span className="w-20 text-right font-semibold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0">
                        -{money(payment.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
