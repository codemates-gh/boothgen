'use client';
// Messages → Templates: the one place to write email templates. Automations send them, and "Load a template" on an
// event or lead fills a message from them.
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Mail, Zap } from 'lucide-react';
import TemplateEditorModal, { type EmailTemplateRow } from '@/components/email/TemplateEditorModal';
import MessagesTabs from '../MessagesTabs';

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplateRow | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/automation/email-templates');
    if (r.ok) setTemplates(await r.json());
    setLoading(false);
  }

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(t: EmailTemplateRow) { setEditing(t); setOpen(true); }

  async function remove(t: EmailTemplateRow) {
    const used = t._count?.automationRules ?? 0;
    const msg = used
      ? `Delete "${t.name}"? ${used} automation${used === 1 ? ' uses' : 's use'} it and will stop sending until you pick another template.`
      : `Delete "${t.name}"?`;
    if (!confirm(msg)) return;
    await fetch('/api/automation/email-templates/' + t.id, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <TopBar title="Messages" />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <MessagesTabs />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Reusable emails. Automations send them, and you can load one when you email a client from an event or lead.</p>
          <Button onClick={openCreate} className="flex-shrink-0"><Plus className="w-4 h-4 mr-2"/>New Template</Button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : templates.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-400">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-medium mb-1">No email templates yet</p>
            <p className="text-sm mb-4">Write a template once, then send it by hand or from an automation</p>
            <Button onClick={openCreate}>Create First Template</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => {
              const used = t._count?.automationRules ?? 0;
              return (
                <Card key={t.id}><CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-gray-500 truncate">Subject: {t.subject}</p>
                    {used > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Zap className="w-3 h-3"/>Used by {used} automation{used === 1 ? '' : 's'}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" aria-label={'Delete ' + t.name} onClick={() => remove(t)}><Trash2 className="w-4 h-4"/></Button>
                  </div>
                </CardContent></Card>
              );
            })}
          </div>
        )}
      </div>

      <TemplateEditorModal open={open} template={editing} onClose={() => setOpen(false)} onSaved={async () => { setOpen(false); await load(); }} />
    </>
  );
}
