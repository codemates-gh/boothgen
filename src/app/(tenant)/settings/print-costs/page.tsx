'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';
import { Plus, Edit2, Trash2, Printer, Star } from 'lucide-react';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['booth-templates','Booth Templates'],['profile','Profile'],['import','Import'],['print-costs','Print Costs'],['genie','Genie']];

type Profile = {
  id: string;
  name: string;
  costPerPrintCents: number;
  isDefault: boolean;
  isActive: boolean;
};

export default function PrintCostsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: '', costPerPrint: '', isDefault: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await fetch('/api/settings/consumable-profiles');
    if (r.ok) setProfiles(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', costPerPrint: '', isDefault: false });
    setShowModal(true);
  }

  function openEdit(p: Profile) {
    setEditing(p);
    setForm({ name: p.name, costPerPrint: (p.costPerPrintCents / 100).toFixed(3), isDefault: p.isDefault });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const body = {
      name: form.name,
      costPerPrintCents: Math.round(parseFloat(form.costPerPrint || '0') * 100),
      isDefault: form.isDefault,
    };
    if (editing) {
      await fetch('/api/settings/consumable-profiles/' + editing.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/settings/consumable-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    await load();
    setShowModal(false);
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this consumable profile?')) return;
    await fetch('/api/settings/consumable-profiles/' + id, { method: 'DELETE' });
    await load();
  }

  async function setDefault(id: string) {
    await fetch('/api/settings/consumable-profiles/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    await load();
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {TABS.map(([href, label]) => (
            <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'print-costs' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
              {label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-1">Consumable Profiles</h2>
            <p className="text-sm text-gray-500">Define your print media / consumable kits and their cost per print. Assign a profile to each event to automatically calculate print costs.</p>
          </div>
          <Button onClick={openCreate} className="shrink-0"><Plus className="w-4 h-4 mr-2"/>Add Profile</Button>
        </div>

        {profiles.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-400">
              <Printer className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="font-medium mb-1">No consumable profiles yet</p>
              <p className="text-sm mb-4">Add your print media kits to track per-print costs on each event.</p>
              <Button onClick={openCreate}>Add First Profile</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-6 py-3">Profile Name</th>
                      <th className="text-right px-6 py-3 w-[160px]">Cost Per Print</th>
                      <th className="px-4 py-3 w-[100px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{p.name}</span>
                            {p.isDefault && (
                              <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                <Star className="w-3 h-3"/>Default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right font-semibold text-sm">
                          ${(p.costPerPrintCents / 100).toFixed(3)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-1 justify-end">
                            {!p.isDefault && (
                              <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)} title="Set as default">
                                <Star className="w-3 h-3"/>
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                              <Edit2 className="w-3 h-3"/>
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3 h-3"/>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm">How to Calculate Cost Per Print</CardTitle></CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-3">
            <p>Divide what you paid for a media kit (paper + ribbon) by the number of prints it yields:</p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 font-mono text-sm text-gray-800">
              Cost per print = Kit price ÷ Prints per kit
            </div>
            <p className="text-xs text-gray-500">Example: a $60 kit that produces 400 prints = <strong>$0.150 per print</strong>. If you bought a twin-pack ribbon (2 × 400 = 800 prints total), divide the full kit price by 800. Add shipping to the kit price if you want the true landed cost.</p>
            <div className="border-t pt-3">
              <p className="font-medium text-gray-700 mb-2 text-xs uppercase tracking-wide">Common yields by printer</p>
              <table className="w-full text-xs text-gray-600">
                <thead><tr className="text-gray-400 font-medium"><th className="text-left pb-1">Printer</th><th className="text-left pb-1">Media</th><th className="text-right pb-1">Prints/kit</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['DNP DS620A','4×6','400'],
                    ['DNP DS620A','5×7','290'],
                    ['DNP DS820A','4×6','700'],
                    ['Mitsubishi CP-D90DW','4×6','700'],
                    ['HiTi S420','4×6','500'],
                  ].map(([printer, media, prints]) => (
                    <tr key={printer + media}>
                      <td className="py-1">{printer}</td>
                      <td className="py-1">{media}</td>
                      <td className="py-1 text-right font-medium">{prints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">Yields vary by supplier lot — check your kit box or product listing for the exact count.</p>
            </div>
            <div className="border-t pt-3 text-xs text-gray-500">
              <p><strong>How it works:</strong> On each event's detail page (visible to you only) you log how many prints were produced and select which kit was used. The system multiplies prints × cost-per-print to compute your print expense, then adds any other expenses (operator pay, travel, etc.) to show net profit per event and across your portfolio in Analytics → Profitability.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Profile' : 'Add Consumable Profile'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Name *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. DNP DS620A — 4x6 Media Kit"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cost Per Print ($) *</label>
            <p className="text-xs text-gray-400 mb-1.5">Enter to 3 decimal places, e.g. 0.180 for $0.18 per print</p>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.costPerPrint}
              onChange={e => setForm(f => ({ ...f, costPerPrint: e.target.value }))}
              placeholder="0.180"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Set as default profile for new events</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.costPerPrint}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Profile'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
