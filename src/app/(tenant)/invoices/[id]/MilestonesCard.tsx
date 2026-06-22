'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Pencil, Check, X } from 'lucide-react';

const MC: Record<string, any> = { PENDING: 'default', PAID: 'success', OVERDUE: 'danger' };

interface Milestone {
  id: string;
  label: string;
  amountCents: number;
  dueDate: string;
  status: string;
}

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);

export default function MilestonesCard({ invoiceId, milestones: initial }: {
  invoiceId: string;
  milestones: Milestone[];
}) {
  const [milestones, setMilestones] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [dateVal, setDateVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit(m: Milestone) {
    setEditing(m.id);
    setDateVal(m.dueDate.slice(0, 10));
    setError('');
  }

  async function save(milestoneId: string) {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/invoices/${invoiceId}/milestones/${milestoneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: dateVal }),
    });
    if (res.ok) {
      setMilestones(ms => ms.map(m => m.id === milestoneId ? { ...m, dueDate: dateVal + 'T00:00:00.000Z' } : m));
      setEditing(null);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to save');
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Payment Schedule</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {milestones.map(m => (
            <div key={m.id} className="flex items-center justify-between px-6 py-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{m.label}</p>
                {editing === m.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="date"
                      value={dateVal}
                      onChange={e => setDateVal(e.target.value)}
                      className="h-7 text-xs w-36"
                    />
                    <Button size="sm" className="h-7 px-2" onClick={() => save(m.id)} disabled={saving}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {error && <span className="text-xs text-red-500">{error}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-gray-400">
                      Due {format(new Date(m.dueDate), 'MMMM d, yyyy')}
                    </p>
                    {m.status !== 'PAID' && (
                      <button onClick={() => startEdit(m)} className="text-gray-300 hover:text-gray-500 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="font-semibold text-sm">{fmt(m.amountCents)}</p>
                <Badge variant={MC[m.status]}>{m.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
