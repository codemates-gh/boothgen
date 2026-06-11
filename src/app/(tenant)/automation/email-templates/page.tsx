'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Trash2, Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', subject: '', bodyHtml: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/automation/email-templates');
    if (r.ok) setTemplates(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', subject: 'Hi {{client.first_name}}, ', bodyHtml: '<p>Hi {{client.first_name}},</p>\n<p></p>\n<p>Thank you for reaching out to {{host.company_name}}!</p>\n<p></p>\n<p>Warm regards,<br/>{{host.company_name}}</p>' });
    setShowModal(true);
  }

  function openEdit(t: any) {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, bodyHtml: t.bodyHtml });
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim() || !form.subject.trim() || !form.bodyHtml.trim()) return;
    setSaving(true);
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? '/api/automation/email-templates/' + editing.id : '/api/automation/email-templates';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { await load(); setShowModal(false); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch('/api/automation/email-templates/' + id, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <TopBar title="Email Templates" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/automation" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4"/>Automation
          </Link>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Template</Button>
        </div>

        {templates.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-400">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-medium mb-1">No email templates yet</p>
            <p className="text-sm mb-4">Create templates to use in automation rules</p>
            <Button onClick={openCreate}>Create First Template</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id}><CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-gray-500">Subject: {t.subject}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4"/></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Template'} className="max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Lead Auto-Reply"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line *</label>
            <Input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Thanks for reaching out, {{client.first_name}}!"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body *</label>
            <EmailTemplateEditor value={form.bodyHtml} onChange={v => set('bodyHtml', v)}/>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.subject.trim() || !form.bodyHtml.trim()}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Template'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
