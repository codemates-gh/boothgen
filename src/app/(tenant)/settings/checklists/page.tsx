'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ChevronDown, ChevronUp, ClipboardList, GripVertical } from 'lucide-react';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];

interface TemplateItem { id: string; label: string; position: number }
interface Template { id: string; name: string; items: TemplateItem[] }

export default function ChecklistsSettingsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [newItems, setNewItems] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');

  useEffect(() => {
    fetch('/api/settings/checklist-templates').then(r => r.json()).then(d => {
      setTemplates(Array.isArray(d) ? d : []);
    });
  }, []);

  async function createTemplate() {
    if (!newName.trim()) return;
    setCreating(true);
    const items = newItems
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map((label, i) => ({ label, position: i }));
    const res = await fetch('/api/settings/checklist-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), items }),
    });
    if (res.ok) {
      const tpl = await res.json();
      setTemplates(prev => [...prev, tpl]);
      setNewName('');
      setNewItems('');
      setShowCreate(false);
    }
    setCreating(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch(`/api/settings/checklist-templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function addItemToTemplate(templateId: string) {
    if (!newItemLabel.trim()) return;
    const res = await fetch(`/api/settings/checklist-templates/${templateId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newItemLabel.trim() }),
    });
    if (res.ok) {
      const item = await res.json();
      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, items: [...t.items, item] } : t));
      setNewItemLabel('');
      setAddingItem(null);
    }
  }

  async function deleteItem(templateId: string, itemId: string) {
    await fetch(`/api/settings/checklist-templates/${templateId}/items/${itemId}`, { method: 'DELETE' });
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t
    ));
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => (
            <Link key={href} href={'/settings/' + href}
              className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'checklists' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Checklist Templates</h2>
            <p className="text-sm text-gray-500 mt-0.5">Reusable task lists you can apply to any event.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(v => !v)}>
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        </div>

        {showCreate && (
          <Card>
            <CardHeader><CardTitle>New Template</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Template Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Day-Of Setup Checklist"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Items <span className="text-gray-400 font-normal">(one per line)</span>
                </label>
                <textarea
                  value={newItems}
                  onChange={e => setNewItems(e.target.value)}
                  placeholder={"Pack photo booth equipment\nCharge batteries\nPrint photo strips\nTest lighting"}
                  rows={5}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button size="sm" onClick={createTemplate} disabled={creating || !newName.trim()}>
                  {creating ? 'Creating…' : 'Create Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {templates.length === 0 && !showCreate && (
          <div className="text-center py-12 text-gray-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">No templates yet</p>
            <p className="text-sm mt-1">Create your first checklist template to reuse across events.</p>
          </div>
        )}

        <div className="space-y-3">
          {templates.map(tpl => (
            <Card key={tpl.id}>
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                onClick={() => toggleExpand(tpl.id)}
              >
                <ClipboardList className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{tpl.name}</p>
                  <p className="text-xs text-gray-400">{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {expanded.has(tpl.id) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>

              {expanded.has(tpl.id) && (
                <CardContent className="border-t border-gray-100 pt-4 space-y-1">
                  {tpl.items.length === 0 && (
                    <p className="text-sm text-gray-400 pb-2">No items in this template.</p>
                  )}
                  {tpl.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 group py-1">
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <span className="flex-1 text-sm text-gray-700">{item.label}</span>
                      <button
                        onClick={() => deleteItem(tpl.id, item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {addingItem === tpl.id ? (
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={newItemLabel}
                        onChange={e => setNewItemLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addItemToTemplate(tpl.id)}
                        placeholder="New item…"
                        autoFocus
                        className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                      />
                      <Button size="sm" onClick={() => addItemToTemplate(tpl.id)} disabled={!newItemLabel.trim()}>Add</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAddingItem(null); setNewItemLabel(''); }}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingItem(tpl.id); setNewItemLabel(''); }}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand mt-2 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add item
                    </button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
