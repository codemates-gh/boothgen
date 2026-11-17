'use client';
// Messages → Automations: "when this happens, send that template". Templates are written in Messages → Templates and
// can be created or edited right from here.
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Zap, Mail, Plus, Trash2, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import TemplateEditorModal, { type EmailTemplateRow } from '@/components/email/TemplateEditorModal';
import MessagesTabs from '../MessagesTabs';

const TRIGGERS: [string, string][] = [
  ['LEAD_CREATED','Lead Created'],['QUOTE_SENT','Quote Sent'],['BOOKING_CONFIRMED','Booking Confirmed'],
  ['CONTRACT_SENT','Contract Sent'],['CONTRACT_FULLY_EXECUTED','Contract Executed'],
  ['INVOICE_SENT','Invoice Sent'],['PAYMENT_RECEIVED','Payment Received'],
  ['EVENT_DATE_MINUS_14_DAYS','14 Days Before Event'],['EVENT_DATE_MINUS_7_DAYS','7 Days Before Event'],
  ['EVENT_DATE_MINUS_1_DAY','Day Before Event'],
  ['EVENT_DATE_PLUS_1_DAY','Day After Event'],['EVENT_DATE_PLUS_3_DAYS','3 Days After Event'],
  ['GALLERY_PUBLISHED','Gallery Published'],
];
const EMPTY = { name: '', trigger: 'LEAD_CREATED', emailTemplateId: '', triggerOffsetHours: '0' };

export default function AutomationsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  // Template editor opened from a rule (new template, or editing the rule's template)
  const [tplOpen, setTplOpen] = useState(false);
  const [tplEditing, setTplEditing] = useState<EmailTemplateRow | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const [r, et] = await Promise.all([fetch('/api/automation/rules'), fetch('/api/automation/email-templates')]);
    if (r.ok) setRules(await r.json());
    if (et.ok) setTemplates(await et.json());
    setLoading(false);
  }

  function openCreate() { setEditingRule(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(rule: any) {
    setEditingRule(rule);
    setForm({ name: rule.name, trigger: rule.trigger, emailTemplateId: rule.emailTemplateId ?? '', triggerOffsetHours: String(rule.triggerOffsetHours ?? 0) });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingRule(null); }

  function editTemplate(id: string | null | undefined) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setTplEditing(t); setTplOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name, trigger: form.trigger, emailTemplateId: form.emailTemplateId, triggerOffsetHours: parseInt(form.triggerOffsetHours) || 0 };
    if (editingRule) {
      await fetch('/api/automation/rules/' + editingRule.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/automation/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, actionType: 'EMAIL' }) });
    }
    await load(); setSaving(false); closeModal(); setForm(EMPTY);
  }

  async function toggleActive(rule: any) {
    await fetch('/api/automation/rules/' + rule.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !rule.isActive }) });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this automation?')) return;
    await fetch('/api/automation/rules/' + id, { method: 'DELETE' });
    await load();
  }

  const triggerLabel = (t: string) => TRIGGERS.find(([v]) => v === t)?.[1] ?? t;

  return (
    <>
      <TopBar title="Messages" />
      <div className="p-4 sm:p-8 space-y-6">
        <MessagesTabs />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Emails that go out on their own at key moments. Each event shows what&apos;s scheduled for it, and you can skip one there.</p>
          <Button onClick={openCreate} className="flex-shrink-0"><Plus className="w-4 h-4 mr-2"/>New Automation</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Automations ({rules.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="px-6 pb-6 text-sm text-gray-400">Loading…</p>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="font-medium mb-1">No automations yet</p>
                <p className="text-sm mb-4">Email clients automatically, like a thank-you when a lead comes in or a reminder the day before the event</p>
                <Button onClick={openCreate}>Create First Automation</Button>
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Automation</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">When</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sends</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{r.name}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{triggerLabel(r.trigger)}</td>
                      <td className="px-6 py-4 text-sm">
                        {r.emailTemplate ? (
                          <button onClick={() => editTemplate(r.emailTemplateId)} className="inline-flex items-center gap-1.5 text-left hover:underline" title="Edit this template">
                            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"/>{r.emailTemplate.name}<Pencil className="w-3 h-3 text-gray-400"/>
                          </button>
                        ) : (
                          <button onClick={() => openEdit(r)} className="text-red-500 hover:underline">No template: pick one</button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button onClick={() => toggleActive(r)} className="flex items-center gap-1.5 text-sm">
                          {r.isActive ? <ToggleRight className="w-5 h-5 text-green-500"/> : <ToggleLeft className="w-5 h-5 text-gray-300"/>}
                          <Badge variant={r.isActive ? 'success' : 'default'}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-700" aria-label="Edit automation" onClick={() => openEdit(r)}><Pencil className="w-4 h-4"/></Button>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" aria-label="Delete automation" onClick={() => deleteRule(r.id)}><Trash2 className="w-4 h-4"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal && !tplOpen} onClose={closeModal} title={editingRule ? 'Edit Automation' : 'New Automation'}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. New Lead Auto-Reply"/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">When *</label>
            <Select value={form.trigger} onChange={e => set('trigger', e.target.value)}>
              {TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Send this template *</label>
              <div className="flex items-center gap-3 text-xs">
                {form.emailTemplateId && <button type="button" className="text-[#0085FF] hover:underline" onClick={() => editTemplate(form.emailTemplateId)}>Edit template</button>}
                <button type="button" className="text-[#0085FF] hover:underline" onClick={() => { setTplEditing(null); setTplOpen(true); }}>+ New template</button>
              </div>
            </div>
            <Select value={form.emailTemplateId} onChange={e => set('emailTemplateId', e.target.value)}>
              <option value="">— Select Template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.emailTemplateId}>{saving ? 'Saving...' : (editingRule ? 'Save Changes' : 'Create Automation')}</Button>
          </div>
        </div>
      </Modal>

      <TemplateEditorModal
        open={tplOpen}
        template={tplEditing}
        onClose={() => setTplOpen(false)}
        onSaved={async t => {
          setTplOpen(false);
          if (showModal) set('emailTemplateId', t.id); // a template made from the automation form is picked for it
          await load();
        }}
      />
    </>
  );
}
