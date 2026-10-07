/**
 * TripsPanel - Tab "Viaggi"
 * Ogni viaggio ha una propria valuta (budget e costi sono espressi in essa,
 * indipendentemente dalla valuta principale dell'app).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getTrips, addTrip, updateTrip, deleteTrip, getTripCosts, addTripCost, deleteTripCost } from '../db';
import type { Trip, TripCost } from '../types';
import { CURRENCIES, currencySymbol, normalizeCurrency } from '../currencies';
import { useLoc } from '../loc';
import { Plane, Plus, Trash2, Edit3, X, Wallet, MapPin } from 'lucide-react';

type TripStatus = 'upcoming' | 'ongoing' | 'completed';

function tripStatus(trip: Trip): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (trip.startDate && today < trip.startDate) return 'upcoming';
  if (trip.endDate && today > trip.endDate) return 'completed';
  if (trip.startDate && today >= trip.startDate) return 'ongoing';
  return 'upcoming';
}

const emptyTrip = () => ({
  name: '', destination: '', startDate: '', endDate: '', budget: '', currency: 'EUR', notes: '',
});

export default function TripsPanel({ onFormOpenChange }: { onFormOpenChange?: (open: boolean) => void }) {
  const loc = useLoc();
  const conv = loc.conv;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form viaggio (nuovo/modifica)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState(emptyTrip());
  const [formErr, setFormErr] = useState<string | null>(null);

  // Dettaglio + costi del viaggio selezionato
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [costs, setCosts] = useState<TripCost[]>([]);
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [costForm, setCostForm] = useState({ description: '', amount: '', date: new Date().toISOString().slice(0, 10), category: 'Altro' });
  const [costErr, setCostErr] = useState<string | null>(null);

  const refresh = useCallback(async (keepSelection = true) => {
    try {
      const list = await getTrips();
      setTrips(list);
      if (!keepSelection || !list.some(t => t.id === selectedId)) {
        setSelectedId(null);
        setCosts([]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { refresh(false); /* eslint-disable-next-line */ }, []);

  const selectTrip = async (id: string) => {
    setSelectedId(id);
    setCostFormOpen(false);
    try {
      setCosts(await getTripCosts(id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyTrip(), currency: loc.currencyCode });
    setFormErr(null);
    setFormOpen(true);
    onFormOpenChange?.(true);
  };

  const openEdit = (trip: Trip) => {
    setEditing(trip);
    setForm({
      name: trip.name, destination: trip.destination ?? '',
      startDate: trip.startDate ?? '', endDate: trip.endDate ?? '',
      budget: String(trip.budget), currency: trip.currency, notes: trip.notes ?? '',
    });
    setFormErr(null);
    setFormOpen(true);
    onFormOpenChange?.(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    onFormOpenChange?.(false);
  };

  const saveTrip = async () => {
    const name = form.name.trim();
    if (!name) { setFormErr(loc.t('trips.err.name')); return; }
    const budget = parseFloat(form.budget || '0');
    if (isNaN(budget) || budget < 0) { setFormErr(loc.t('trips.err.budget')); return; }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setFormErr(loc.t('trips.err.dateEnd')); return;
    }
    const payload: any = {
      name,
      destination: form.destination.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      budget,
      currency: normalizeCurrency(form.currency),
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editing) {
        await updateTrip({ ...editing, ...payload } as Trip);
      } else {
        await addTrip(payload as Trip);
      }
      closeForm();
      await refresh();
    } catch (e: any) {
      setFormErr(e?.message ?? String(e));
    }
  };

  const removeTrip = async (trip: Trip) => {
    if (!confirm(loc.t('trips.deleteConfirm'))) return;
    await deleteTrip(trip.id);
    if (selectedId === trip.id) { setSelectedId(null); setCosts([]); }
    await refresh();
  };

  const saveCost = async () => {
    if (!selectedId) return;
    const desc = costForm.description.trim();
    const amount = parseFloat(costForm.amount);
    if (!desc || isNaN(amount) || amount <= 0) {
      setCostErr(`⚠️ ${loc.t('common.description')} / ${loc.t('common.amount')}`);
      return;
    }
    try {
      await addTripCost({
        id: '', tripId: selectedId, description: desc, amount,
        date: costForm.date, category: costForm.category,
      } as TripCost);
      setCostForm({ ...costForm, description: '', amount: '' });
      setCostErr(null);
      setCostFormOpen(false);
      setCosts(await getTripCosts(selectedId));
      await refresh();
    } catch (e: any) {
      setCostErr(e?.message ?? String(e));
    }
  };

  const removeCost = async (cost: TripCost) => {
    if (!confirm(loc.t('trips.deleteCostConfirm'))) return;
    await deleteTripCost(cost.id);
    if (selectedId) setCosts(await getTripCosts(selectedId));
    await refresh();
  };

  const fmtIn = (amount: number, curCode: string) => {
    const sym = currencySymbol(curCode);
    const nf = new Intl.NumberFormat(loc.lang === 'it' ? 'it-IT' : 'en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    return `${sym}${nf.format(Number.isFinite(amount) ? amount : 0)}`;
  };

  const statusBadge: Record<TripStatus, { key: string; cls: string }> = {
    upcoming: { key: 'trips.statusUpcoming', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    ongoing: { key: 'trips.statusOngoing', cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    completed: { key: 'trips.statusDone', cls: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  };

  const selected = trips.find(t => t.id === selectedId) ?? null;
  const totalSpent = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const remaining = (selected?.budget ?? 0) - totalSpent;

  if (loading) return <div className="p-6 text-center text-gray-500">{loc.t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
            <Plane className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{loc.t('trips.title')}</h2>
            <p className="text-xs text-gray-500">{loc.t('trips.subtitle')}</p>
          </div>
        </div>
        {!formOpen && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition shadow-md">
            <Plus className="w-4 h-4" /> {loc.t('trips.new')}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Form nuovo/modifica viaggio */}
      {formOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-4">
          <h3 className="font-bold text-gray-800 dark:text-white">
            {editing ? loc.t('trips.edit') : loc.t('trips.new')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.name')} *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={loc.t('trips.namePlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.destination')}</label>
              <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}
                placeholder={loc.t('trips.destinationPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.startDate')}</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.endDate')}</label>
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.budget')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                  {currencySymbol(form.currency)}
                </span>
                <input type="number" min="0" step="0.01" value={form.budget}
                  onChange={e => setForm({ ...form, budget: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('trips.currency')}</label>
              <select value={normalizeCurrency(form.currency)}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white">
                {[...CURRENCIES]
                  .sort((a, b) => (loc.lang === 'it' ? a.nameIt : a.nameEn).localeCompare(loc.lang === 'it' ? b.nameIt : b.nameEn))
                  .map(c => (
                  <option key={c.code} value={c.code}>
                    {loc.lang === 'it' ? c.nameIt : c.nameEn} ({c.symbol})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{loc.t('trips.currencyHelp')}</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{loc.t('common.notesOptional')}</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />
            </div>
          </div>
          {formErr && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{formErr}</p>}
          <div className="flex gap-3">
            <button onClick={saveTrip}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition">
              {loc.t('trips.save')}
            </button>
            <button onClick={closeForm}
              className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium transition">
              {loc.t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Lista viaggi */}
      {trips.length === 0 && !formOpen ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-10 text-center text-gray-500">
          <Plane className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {loc.t('trips.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {trips.map(trip => {
            const st = tripStatus(trip);
            const spent = trip.spent ?? 0;
            const over = trip.budget > 0 && spent > trip.budget;
            const pct = trip.budget > 0 ? Math.min(100, (spent / trip.budget) * 100) : 0;
            return (
              <div key={trip.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl shadow p-4 cursor-pointer transition border-2 ${selectedId === trip.id ? 'border-purple-500' : 'border-transparent hover:border-purple-200'}`}
                onClick={() => selectTrip(trip.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                      {trip.name}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge[st].cls}`}>
                        {loc.t(statusBadge[st].key)}
                      </span>
                    </h3>
                    {trip.destination && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {trip.destination}
                      </p>
                    )}
                    {(trip.startDate || trip.endDate) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {trip.startDate ? loc.dateLabel(trip.startDate) : ''}
                        {trip.endDate ? ` → ${loc.dateLabel(trip.endDate)}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button title={loc.t('common.edit')} onClick={(e) => { e.stopPropagation(); openEdit(trip); }}
                      className="p-1.5 text-gray-400 hover:text-purple-600 transition"><Edit3 className="w-4 h-4" /></button>
                    <button title={loc.t('common.delete')} onClick={(e) => { e.stopPropagation(); removeTrip(trip); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{loc.t('trips.spent')}</span>
                    <span className={`font-semibold ${over ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                      {fmtIn(spent, trip.currency)} / {fmtIn(trip.budget, trip.currency)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-xs mt-1 ${over ? 'text-red-500' : 'text-gray-400'}`}>
                    {over ? `${loc.t('trips.over')}: ` : `${loc.t('trips.remaining')}: `}
                    {fmtIn(Math.abs(remaining === 0 ? spent - trip.budget : (trip.budget - spent)), trip.currency)}
                  </p>
                  {normalizeCurrency(trip.currency) !== loc.currencyCode && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {loc.t('trips.budgetInMain', { amount: loc.fmt(conv(trip.budget, trip.currency)) })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dettaglio costi viaggio selezionato */}
      {selected && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-gray-800 dark:text-white">
              {loc.t('trips.costs')} — {selected.name}
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({loc.t('trips.totalForTrip')}: {fmtIn(totalSpent, selected.currency)})
              </span>
            </h3>
            {!costFormOpen && (
              <button onClick={() => { setCostForm({ ...costForm, date: new Date().toISOString().slice(0, 10) }); setCostFormOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition">
                <Plus className="w-3.5 h-3.5" /> {loc.t('trips.addCost')}
              </button>
            )}
          </div>

          {costFormOpen && (
            <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input value={costForm.description} placeholder={loc.t('common.description')}
                  onChange={e => setCostForm({ ...costForm, description: e.target.value })}
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm" />
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                    {currencySymbol(selected.currency)}
                  </span>
                  <input type="number" min="0" step="0.01" value={costForm.amount} placeholder={loc.t('common.amount')}
                    onChange={e => setCostForm({ ...costForm, amount: e.target.value })}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm" />
                </div>
                <input type="date" value={costForm.date}
                  onChange={e => setCostForm({ ...costForm, date: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm" />
              </div>
              {costErr && <p className="text-xs text-red-600 mt-2">{costErr}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={saveCost}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition">
                  {loc.t('common.add')}
                </button>
                <button onClick={() => { setCostFormOpen(false); setCostErr(null); }}
                  className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition">
                  {loc.t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {costs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{loc.t('trips.noCosts')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 font-medium">{loc.t('trips.costDate')}</th>
                  <th className="py-2 font-medium">{loc.t('common.description')}</th>
                  <th className="py-2 font-medium">{loc.t('common.category')}</th>
                  <th className="py-2 font-medium text-right">{loc.t('common.amount')}</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {costs.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700/50 text-gray-700 dark:text-gray-300">
                    <td className="py-2 whitespace-nowrap">{loc.dateLabel(c.date)}</td>
                    <td className="py-2">{c.description}</td>
                    <td className="py-2 text-gray-400">{c.category}</td>
                    <td className="py-2 text-right font-medium">{fmtIn(c.amount, selected.currency)}</td>
                    <td className="py-2">
                      <button onClick={() => removeCost(c)} title={loc.t('common.delete')}
                        className="p-1 text-gray-400 hover:text-red-600 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
