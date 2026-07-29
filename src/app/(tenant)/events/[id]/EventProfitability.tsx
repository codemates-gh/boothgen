'use client';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtCents } from '@/lib/utils';
import { TrendingUp, Printer, DollarSign, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

type Profile = { id: string; name: string; costPerPrintCents: number; isDefault: boolean };
type Expense = { id: string; description: string; amountCents: number; category: string };
type PrintLog = { printCount: number; consumableProfileId: string | null; notes: string | null; consumableProfile: Profile | null } | null;

const CATEGORIES = [
  ['labor', 'Operator Pay'],
  ['travel', 'Travel'],
  ['supplies', 'Supplies'],
  ['rental', 'Equipment Rental'],
  ['other', 'Other'],
];

function pct(n: number, d: number) {
  if (d === 0) return null;
  return Math.round((n / d) * 100);
}

export default function EventProfitability({
  eventId,
  revenueCents,
  currency,
}: {
  eventId: string;
  revenueCents: number;
  currency: string;
}) {
  const fmt = (c: number) => fmtCents(c, currency);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [printLog, setPrintLog] = useState<PrintLog>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Print log editing
  const [editingPrint, setEditingPrint] = useState(false);
  const [printForm, setPrintForm] = useState({ printCount: '', consumableProfileId: '', notes: '' });
  const [savingPrint, setSavingPrint] = useState(false);

  // Expense form
  const [expForm, setExpForm] = useState({ description: '', amount: '', category: 'labor' });
  const [addingExp, setAddingExp] = useState(false);
  const [savingExp, setSavingExp] = useState(false);

  const loadAll = useCallback(async () => {
    const [logRes, expRes, profRes] = await Promise.all([
      fetch(`/api/events/${eventId}/print-log`),
      fetch(`/api/events/${eventId}/expenses`),
      fetch('/api/settings/consumable-profiles'),
    ]);
    if (logRes.ok) setPrintLog(await logRes.json());
    if (expRes.ok) setExpenses(await expRes.json());
    if (profRes.ok) setProfiles(await profRes.json());
  }, [eventId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function openEditPrint() {
    setPrintForm({
      printCount: printLog ? String(printLog.printCount) : '0',
      consumableProfileId: printLog?.consumableProfileId ?? (profiles.find(p => p.isDefault)?.id ?? ''),
      notes: printLog?.notes ?? '',
    });
    setEditingPrint(true);
  }

  async function savePrint() {
    setSavingPrint(true);
    await fetch(`/api/events/${eventId}/print-log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printCount: parseInt(printForm.printCount || '0'),
        consumableProfileId: printForm.consumableProfileId || null,
        notes: printForm.notes || null,
      }),
    });
    await loadAll();
    setEditingPrint(false);
    setSavingPrint(false);
  }

  async function addExpense() {
    if (!expForm.description.trim() || !expForm.amount) return;
    setSavingExp(true);
    await fetch(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: expForm.description,
        amountCents: Math.round(parseFloat(expForm.amount) * 100),
        category: expForm.category,
      }),
    });
    setExpForm({ description: '', amount: '', category: 'labor' });
    setAddingExp(false);
    setSavingExp(false);
    await loadAll();
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/events/${eventId}/expenses/${id}`, { method: 'DELETE' });
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  const printCostCents = printLog
    ? (printLog.printCount ?? 0) * (printLog.consumableProfile?.costPerPrintCents ?? 0)
    : 0;
  const otherCostCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const totalCostCents = printCostCents + otherCostCents;
  const profitCents = revenueCents - totalCostCents;
  const marginPct = pct(profitCents, revenueCents);

  const profitColor = profitCents >= 0 ? 'text-emerald-600' : 'text-red-600';
  const marginColor = (marginPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <Card className="border-l-4 border-l-indigo-400">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-indigo-500"/>
            Profitability <span className="text-xs font-normal text-gray-400 ml-1">(visible to you only)</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>

        {/* KPI row — always visible */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[
            { label: 'Revenue', value: fmt(revenueCents), icon: <DollarSign className="w-3.5 h-3.5"/> },
            { label: 'Total Cost', value: fmt(totalCostCents), icon: <DollarSign className="w-3.5 h-3.5"/> },
            { label: 'Profit', value: fmt(profitCents), extra: profitColor },
            { label: 'Margin', value: marginPct !== null ? `${marginPct}%` : '—', extra: marginColor },
          ].map(({ label, value, extra }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className={`font-bold text-sm ${extra ?? ''}`}>{value}</p>
            </div>
          ))}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 pt-0">
          {/* Print Log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5 text-gray-700"><Printer className="w-3.5 h-3.5"/>Print Log</p>
              <Button variant="ghost" size="sm" onClick={openEditPrint}>
                {printLog ? 'Edit' : 'Log Prints'}
              </Button>
            </div>

            {editingPrint ? (
              <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Print Count</label>
                    <Input
                      type="number"
                      min="0"
                      value={printForm.printCount}
                      onChange={e => setPrintForm(f => ({ ...f, printCount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Consumable Profile</label>
                    <select
                      value={printForm.consumableProfileId}
                      onChange={e => setPrintForm(f => ({ ...f, consumableProfileId: e.target.value }))}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="">— No profile —</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${(p.costPerPrintCents / 100).toFixed(3)}/print)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <Input
                    value={printForm.notes}
                    onChange={e => setPrintForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingPrint(false)}>Cancel</Button>
                  <Button size="sm" onClick={savePrint} disabled={savingPrint}>
                    {savingPrint ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : printLog && printLog.printCount > 0 ? (
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{printLog.printCount} prints</span>
                  {printLog.consumableProfile && (
                    <span className="text-gray-500"> via {printLog.consumableProfile.name}</span>
                  )}
                  {printLog.notes && <p className="text-xs text-gray-400 mt-0.5">{printLog.notes}</p>}
                </div>
                <span className="font-semibold text-sm">{fmt(printCostCents)}</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No prints logged yet.</p>
            )}
          </div>

          {/* Expenses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Other Expenses</p>
              <Button variant="ghost" size="sm" onClick={() => setAddingExp(a => !a)}>
                <Plus className="w-3.5 h-3.5 mr-1"/>Add
              </Button>
            </div>

            {addingExp && (
              <div className="border rounded-lg p-4 space-y-3 bg-gray-50 mb-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <select
                      value={expForm.category}
                      onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={expForm.amount}
                      onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <Input
                    value={expForm.description}
                    onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Juan — operator fee, Round-trip mileage"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddingExp(false)}>Cancel</Button>
                  <Button size="sm" onClick={addExpense} disabled={savingExp || !expForm.description.trim() || !expForm.amount}>
                    {savingExp ? 'Adding...' : 'Add Expense'}
                  </Button>
                </div>
              </div>
            )}

            {expenses.length > 0 ? (
              <div className="space-y-1">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-gray-50 group">
                    <div>
                      <span className="font-medium">{e.description}</span>
                      <span className="ml-2 text-xs text-gray-400 capitalize">{CATEGORIES.find(c => c[0] === e.category)?.[1] ?? e.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fmt(e.amountCents)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteExpense(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5"/>
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-2 px-3">
                  <span>Total Expenses</span>
                  <span>{fmt(otherCostCents)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No expenses added yet.</p>
            )}
          </div>

          {/* Summary row */}
          <div className="border-t pt-4 flex flex-wrap gap-4 text-sm">
            <div><span className="text-gray-500">Print cost:</span> <span className="font-semibold">{fmt(printCostCents)}</span></div>
            <div><span className="text-gray-500">Other expenses:</span> <span className="font-semibold">{fmt(otherCostCents)}</span></div>
            <div><span className="text-gray-500">Total cost:</span> <span className="font-semibold">{fmt(totalCostCents)}</span></div>
            <div><span className="text-gray-500">Net profit:</span> <span className={`font-bold ${profitColor}`}>{fmt(profitCents)}</span></div>
            {marginPct !== null && (
              <div><span className="text-gray-500">Margin:</span> <span className={`font-bold ${marginColor}`}>{marginPct}%</span></div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
