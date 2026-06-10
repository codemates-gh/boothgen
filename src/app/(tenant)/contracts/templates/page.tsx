'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Star, FileText } from 'lucide-react';
import Link from 'next/link';

export default function ContractTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const DEFAULT_BODY = `<h2>EVENT SERVICES AGREEMENT</h2>
<p>This Agreement is entered into between {{host.company_name}} ("Company") and {{client.full_name}} ("Client").</p>

<h3>1. Event Details</h3>
<p>Event: {{event.title}}<br/>Date: {{event.date}}<br/>Venue: {{event.venue_name}}</p>

<h3>2. Services</h3>
<p>Company agrees to provide photo booth services for the package: {{event.package_name}}.</p>

<h3>3. Payment</h3>
<p>Total: {{invoice.total}}<br/>Retainer due at signing: {{invoice.retainer_amount}}<br/>Balance due: {{invoice.balance_due}}</p>

<h3>4. Cancellation Policy</h3>
<p>Cancellations more than 30 days before the event date forfeit the retainer. Cancellations within 30 days are subject to 50% of the total contract value.</p>

<h3>5. Agreement</h3>
<p>By signing below, both parties agree to the terms outlined in this agreement.</p>`;

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/contracts/templates');
    setTemplates(await res.json());
  }

  function openCreate() {
    setEditing(null); setName('Standard Event Agreement'); setBody(DEFAULT_BODY); setShowModal(true);
  }

  function openEdit(t: any) {
    setEditing(t); setName(t.name); setBody(t.bodyHtml); setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? '/api/contracts/templates/' + editing.id : '/api/contracts/templates';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, bodyHtml: body }) });
    if (res.ok) { await load(); setShowModal(false); }
    setSaving(false);
  }

  async function setDefault(id: string) {
    await fetch('/api/contracts/templates/' + id + '/default', { method: 'POST' });
    await load();
  }

  return (
    <>
      <TopBar title="Contract Templates" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/contracts" className="text-sm text-gray-500 hover:text-gray-700">← Contracts</Link>
            <p className="text-sm text-gray-500 mt-1">Use merge tags like <code className="bg-gray-100 px-1 rounded">{"{{client.full_name}}"}</code> to auto-fill contract details.</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Template</Button>
        </div>

        {templates.length === 0 ? (
          <Card><CardContent className="text-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
            <p className="font-medium mb-2">No templates yet</p>
            <p className="text-sm mb-4">Create a template to reuse across contracts</p>
            <Button onClick={openCreate}>Create First Template</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400"/>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{t.name}</p>
                        {t.isDefault && <span className="flex items-center gap-1 text-xs bg-brand-surface text-brand px-2 py-0.5 rounded-full font-medium"><Star className="w-3 h-3"/>Default</span>}
                      </div>
                      <p className="text-xs text-gray-400">Created {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!t.isDefault && <Button variant="outline" size="sm" onClick={() => setDefault(t.id)}>Set Default</Button>}
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm">Available Merge Tags</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono text-gray-600">
              {[['{{client.full_name}}','Client full name'],['{{client.first_name}}','Client first name'],['{{client.email}}','Client email'],['{{event.title}}','Event name'],['{{event.date}}','Event date'],['{{event.venue_name}}','Venue name'],['{{event.package_name}}','Package name'],['{{event.guest_count}}','Guest count'],['{{invoice.total}}','Invoice total'],['{{invoice.retainer_amount}}','Retainer amount'],['{{invoice.balance_due}}','Balance due'],['{{invoice.due_date}}','Due date'],['{{host.company_name}}','Your company name'],['{{host.email}}','Your email'],['{{host.phone}}','Your phone']].map(([tag, desc]) => (
                <div key={tag} className="flex items-center gap-2 py-1"><code className="bg-gray-100 px-1.5 py-0.5 rounded text-brand">{tag}</code><span className="text-gray-400">{desc}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Template'} className="max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Standard Event Agreement"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Body (HTML)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full h-80 font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand resize-none" placeholder="Enter contract HTML..."/>
            <p className="text-xs text-gray-400 mt-1">Use HTML for formatting. Merge tags like {"{{client.full_name}}"} will be replaced when sending.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name.trim() || !body.trim()}>{saving ? 'Saving...' : 'Save Template'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
