'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['profile','Profile']];

const fmt = (v: number, type: string) => type === 'PERCENTAGE' ? `${v}% off` : `$${v.toFixed(2)} off`;

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    fetch('/api/settings/coupons').then(r => r.json()).then(d => { setCoupons(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/settings/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, description, type, value: parseFloat(value), maxUses: maxUses || null, expiresAt: expiresAt || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setCoupons(prev => [{ ...data, usedCount: 0, _count: { quotes: 0 } }, ...prev]);
        setCode(''); setDescription(''); setType('PERCENTAGE'); setValue(''); setMaxUses(''); setExpiresAt('');
        setShowForm(false);
      } else {
        setError(data.error || 'Failed to create coupon');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/settings/coupons/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    });
    if (res.ok) setCoupons(prev => prev.map(c => c.id === id ? { ...c, isActive: !current } : c));
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Delete this coupon? This cannot be undone.')) return;
    const res = await fetch(`/api/settings/coupons/${id}`, { method: 'DELETE' });
    if (res.ok) { setCoupons(prev => prev.filter(c => c.id !== id)); }
    else { const d = await res.json(); alert(d.error || 'Failed to delete'); }
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-3 sm:px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'coupons' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Discount Coupons</h2>
            <p className="text-sm text-gray-500">Create coupon codes operators can apply to quotes.</p>
          </div>
          <Button onClick={() => setShowForm(v => !v)} size="sm">
            <Plus className="w-4 h-4 mr-1" />{showForm ? 'Cancel' : 'New Coupon'}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="w-4 h-4"/>Create Coupon</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createCoupon} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Coupon Code *</label>
                    <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SUMMER20" required className="font-mono tracking-wider" />
                    <p className="text-xs text-gray-400 mt-1">Auto-uppercased. Share this with clients.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Summer promotion" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Discount Type *</label>
                    <select value={type} onChange={e => setType(e.target.value as any)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <option value="PERCENTAGE">Percentage off (%)</option>
                      <option value="FIXED_AMOUNT">Fixed amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {type === 'PERCENTAGE' ? 'Percentage (1–100)' : 'Amount ($)'} *
                    </label>
                    <Input type="number" min={type === 'PERCENTAGE' ? '1' : '0.01'} max={type === 'PERCENTAGE' ? '100' : undefined} step={type === 'PERCENTAGE' ? '1' : '0.01'} value={value} onChange={e => setValue(e.target.value)} placeholder={type === 'PERCENTAGE' ? '20' : '50.00'} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Max Uses (leave blank for unlimited)</label>
                    <Input type="number" min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Expires On (optional)</label>
                    <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-3">
                  <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Coupon'}</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setError(''); }}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading coupons…</div>
            ) : coupons.length === 0 ? (
              <div className="p-8 text-center">
                <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm font-medium">No coupons yet</p>
                <p className="text-gray-400 text-xs mt-1">Create a coupon to offer discounts on quotes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Discount</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Uses</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Expires</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-mono font-bold text-sm text-gray-900">{c.code}</p>
                          {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold text-green-700">{fmt(c.value, c.type)}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500">
                          {c.expiresAt ? format(new Date(c.expiresAt), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={c.isActive ? 'success' : 'default'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => toggleActive(c.id, c.isActive)} className="text-gray-400 hover:text-brand transition-colors" title={c.isActive ? 'Deactivate' : 'Activate'}>
                              {c.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            {c.usedCount === 0 && (
                              <button onClick={() => deleteCoupon(c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
