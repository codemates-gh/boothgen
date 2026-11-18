'use client';
// Create or edit an email template (Messages → Templates, and from an automation rule)
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';

export interface EmailTemplateRow { id: string; name: string; subject: string; bodyHtml: string; _count?: { automationRules: number } }

const NEW_TEMPLATE = {
  name: '',
  subject: 'Hi {{client.first_name}}, ',
  bodyHtml: '<p>Hi {{client.first_name}},</p>\n<p></p>\n<p>Thank you for reaching out to {{host.company_name}}!</p>\n<p></p>\n<p>Warm regards,<br/>{{host.company_name}}</p>',
};

export default function TemplateEditorModal({ open, template, onClose, onSaved }: {
  open: boolean;
  template: EmailTemplateRow | null; // null: a new template
  onClose: () => void;
  onSaved: (t: EmailTemplateRow) => void;
}) {
  const [form, setForm] = useState(NEW_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof NEW_TEMPLATE, v: string) => { setSaved(false); setForm(f => ({ ...f, [k]: v })); };

  useEffect(() => {
    if (!open) return;
    setForm(template ? { name: template.name, subject: template.subject, bodyHtml: template.bodyHtml } : NEW_TEMPLATE);
    setError(''); setSaved(false);
  }, [open, template]);

  async function aiImprove(currentHtml: string) {
    if (!template?.id) return;
    setImproving(true);
    const res = await fetch(`/api/automation/email-templates/${template.id}/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: form.subject, bodyHtml: currentHtml }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.subject) set('subject', d.subject);
      if (d.bodyHtml) set('bodyHtml', d.bodyHtml);
    }
    setImproving(false);
  }

  async function save() {
    if (!form.name.trim() || !form.subject.trim() || !form.bodyHtml.trim()) return;
    setSaving(true); setError('');
    const res = await fetch(template ? '/api/automation/email-templates/' + template.id : '/api/automation/email-templates', {
      method: template ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Could not save the template'); return; }
    if (template) setSaved(true);
    onSaved(d);
  }

  const ready = form.name.trim() && form.subject.trim() && form.bodyHtml.trim();
  return (
    <Modal open={open} onClose={onClose} title={template ? 'Edit Template' : 'New Template'} className="max-w-3xl">
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
          <EmailTemplateEditor value={form.bodyHtml} onChange={v => set('bodyHtml', v)} onAiImprove={template ? aiImprove : undefined} aiImproving={improving} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <Button variant="outline" onClick={onClose}>{saved ? 'Close' : 'Cancel'}</Button>
          <Button onClick={save} disabled={saving || !ready}>{saving ? 'Saving...' : template ? 'Update' : 'Create Template'}</Button>
        </div>
      </div>
    </Modal>
  );
}
