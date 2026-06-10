'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Zap, Mail, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const TRIGGERS: [string, string][] = [
  ['LEAD_CREATED','Lead Created'],['QUOTE_SENT','Quote Sent'],['BOOKING_CONFIRMED','Booking Confirmed'],
  ['CONTRACT_SENT','Contract Sent'],['CONTRACT_FULLY_EXECUTED','Contract Executed'],
  ['INVOICE_SENT','Invoice Sent'],['PAYMENT_RECEIVED','Payment Received'],
  ['EVENT_DATE_MINUS_14_DAYS','14 Days Before Event'],['EVENT_DATE_MINUS_7_DAYS','7 Days Before Event'],
  ['EVENT_DATE_MINUS_1_DAY','Day Before Event'],
  ['EVENT_DATE_PLUS_1_DAY','Day After Event'],['EVENT_DATE_PLUS_3_DAYS','3 Days After Event'],
  ['GALLERY_PUBLISHED','Gallery Published'],
];

export default function AutomationPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:'', trigger:'LEAD_CREATED', emailTemplateId:'', triggerOffsetHours:'0' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const [r, t] = await Promise.all([fetch('/api/automation/rules'), fetch('/api/contracts/templates')]);
    setRules(await r.json());
    const tdata = await t.json();
    // Get email templates separately
    const et = await fetch('/api/automation/email-templates');
    if (et.ok) setTemplates(await et.json());
  }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch('/api/automation/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, actionType: 'EMAIL', triggerOffsetHours: parseInt(form.triggerOffsetHours) || 0 }) });
    await load(); setShowModal(false); setSaving(false);
    setForm({ name:'', trigger:'LEAD_CREATED', emailTemplateId:'', triggerOffsetHours:'0' });
  }

  async function toggleActive(rule: any) {
    await fetch('/api/automation/rules/' + rule.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !rule.isActive }) });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return;
    await fetch('/api/automation/rules/' + id, { method: 'DELETE' });
    await load();
  }

  const triggerLabel = (t: string) => TRIGGERS.find(([v]) => v === t)?.[1] ?? t;

  return (
    <>
      <TopBar title="Automation" />
      <div className="p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-start gap-3 flex-1 mr-4">
            <Zap className="w-5 h-5 text-brand mt-0.5 flex-shrink-0"/>
            <div>
              <p className="font-semibold text-brand-dark">Email Automation</p>
              <p className="text-sm text-gray-600 mt-1">Rules trigger automated emails at key points in your client journey. Create email templates in <a href="/contracts/templates" className="text-brand underline">Settings → Templates</a> first.</p>
            </div>
          </div>
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-2"/>New Rule</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Rules ({rules.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="font-medium mb-1">No automation rules yet</p>
                <p className="text-sm mb-4">Create rules to automatically email clients at key moments</p>
                <Button onClick={() => setShowModal(true)}>Create First Rule</Button>
              </div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Rule</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email Template</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{r.name}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{triggerLabel(r.trigger)}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400"/>{r.emailTemplate?.name ?? <span className="text-red-500">No template</span>}</div></td>
                      <td className="px-6 py-4">
                        <button onClick={() => toggleActive(r)} className="flex items-center gap-1.5 text-sm">
                          {r.isActive ? <ToggleRight className="w-5 h-5 text-green-500"/> : <ToggleLeft className="w-5 h-5 text-gray-300"/>}
                          <Badge variant={r.isActive ? 'success' : 'default'}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => deleteRule(r.id)}><Trash2 className="w-4 h-4"/></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Automation Rule">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
            <Input value={form.name} onChange={e => set('name',e.target.value)} placeholder="e.g. New Lead Auto-Reply"/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Trigger *</label>
            <Select value={form.trigger} onChange={e => set('trigger',e.target.value)}>
              {TRIGGERS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </Select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Template *</label>
            <Select value={form.emailTemplateId} onChange={e => set('emailTemplateId',e.target.value)}>
              <option value="">— Select Template —</option>
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            {templates.length === 0 && <p className="text-xs text-amber-600 mt-1">⚠️ No email templates found. <a href="/automation/email-templates" className="underline">Create one first</a>.</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name.trim() || !form.emailTemplateId}>{saving ? 'Creating...' : 'Create Rule'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
