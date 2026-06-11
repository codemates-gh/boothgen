'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Star, FileText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';

const CONTRACT_TAGS = [
  { label: 'Client First Name', value: '{{client.first_name}}' },
  { label: 'Client Full Name', value: '{{client.full_name}}' },
  { label: 'Client Email', value: '{{client.email}}' },
  { label: 'Event Title', value: '{{event.title}}' },
  { label: 'Event Date', value: '{{event.date}}' },
  { label: 'Event Start Time', value: '{{event.start_time}}' },
  { label: 'Event End Time', value: '{{event.end_time}}' },
  { label: 'Venue Name', value: '{{event.venue_name}}' },
  { label: 'Venue Address', value: '{{event.venue_address}}' },
  { label: 'Venue City', value: '{{event.venue_city}}' },
  { label: 'Venue State', value: '{{event.venue_state}}' },
  { label: 'Venue Zip Code', value: '{{event.venue_zip}}' },
  { label: 'Package Name', value: '{{event.package_name}}' },
  { label: 'Guest Count', value: '{{event.guest_count}}' },
  { label: 'Invoice Total', value: '{{invoice.total}}' },
  { label: 'Retainer Amount', value: '{{invoice.retainer_amount}}' },
  { label: 'Balance Due', value: '{{invoice.balance_due}}' },
  { label: 'Due Date', value: '{{invoice.due_date}}' },
  { label: 'Company Name', value: '{{host.company_name}}' },
  { label: 'Company Email', value: '{{host.email}}' },
  { label: 'Company Phone', value: '{{host.phone}}' },
  { label: 'Today\'s Date', value: '{{today}}' },
];

const DEFAULT_CONTRACT = `<h2 style="text-align:center">EVENT SERVICES AGREEMENT</h2>

<p>This Agreement is entered into between <strong>{{host.company_name}}</strong> ("Company") and <strong>{{client.full_name}}</strong> ("Client") as of {{today}}.</p>

<h3>1. Event Details</h3>
<p>
  <strong>Event:</strong> {{event.title}}<br/>
  <strong>Date:</strong> {{event.date}}<br/>
  <strong>Time:</strong> {{event.start_time}} – {{event.end_time}}<br/>
  <strong>Venue:</strong> {{event.venue_name}}<br/>
  <strong>Address:</strong> {{event.venue_address}}, {{event.venue_city}}, {{event.venue_state}}<br/>
  <strong>Estimated Guests:</strong> {{event.guest_count}}
</p>

<h3>2. Services</h3>
<p>Company agrees to provide photo booth services for the package: <strong>{{event.package_name}}</strong>. Services include setup, operation, and breakdown of equipment as agreed.</p>

<h3>3. Payment</h3>
<p>
  <strong>Total:</strong> {{invoice.total}}<br/>
  <strong>Retainer (due at signing):</strong> {{invoice.retainer_amount}}<br/>
  <strong>Balance Due:</strong> {{invoice.balance_due}} by {{invoice.due_date}}
</p>

<h3>4. Cancellation Policy</h3>
<p>Cancellations more than 30 days before the event date forfeit the retainer. Cancellations within 30 days are subject to 50% of the total contract value. Company reserves the right to cancel due to circumstances beyond our control.</p>

<h3>5. Equipment & Setup</h3>
<p>Client agrees to provide adequate space and power access for equipment setup. Company will arrive 60–90 minutes prior to event start for setup.</p>

<h3>6. Liability</h3>
<p>Company is not liable for any damage to persons or property not caused directly by the Company. Client assumes responsibility for the conduct of their guests.</p>

<h3>7. Agreement</h3>
<p>By signing below, both parties agree to the terms outlined in this agreement. This contract becomes binding upon receipt of the signed agreement and retainer payment.</p>`;

export default function ContractTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/contracts/templates');
    if (r.ok) setTemplates(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setName('Standard Event Agreement');
    setBody(DEFAULT_CONTRACT);
    setShowModal(true);
  }

  function openEdit(t: any) {
    setEditing(t);
    setName(t.name);
    setBody(t.bodyHtml);
    setShowModal(true);
  }

  async function save() {
    if (!name.trim() || !body.trim()) return;
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

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch('/api/contracts/templates/' + id, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <TopBar title="Contract Templates" />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <Link href="/contracts" className="text-sm text-gray-500 hover:text-gray-700">← Contracts</Link>
            <p className="text-sm text-gray-500 mt-1">Create reusable contract templates with merge tags for client and event details.</p>
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
              <Card key={t.id}><CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0"/>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{t.name}</p>
                      {t.isDefault && <span className="flex items-center gap-1 text-xs bg-brand-surface text-brand px-2 py-0.5 rounded-full font-medium"><Star className="w-3 h-3"/>Default</span>}
                    </div>
                    <p className="text-xs text-gray-400">Created {new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!t.isDefault && <Button variant="outline" size="sm" onClick={() => setDefault(t.id)}>Set Default</Button>}
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4"/></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Contract Template'} className="max-w-4xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Standard Event Agreement"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract Body *</label>
            <EmailTemplateEditor value={body} onChange={setBody}/>
            <p className="text-xs text-gray-400 mt-1">Use the "Insert Variable" dropdown to add merge tags. Switch to HTML mode for advanced formatting.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name.trim() || !body.trim()}>
              {saving ? 'Saving...' : editing ? 'Update Template' : 'Save Template'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
