'use client';
import { useState, useEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, ChevronDown, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Item { id: string; label: string; isCompleted: boolean; position: number }
interface Template { id: string; name: string; items: { label: string }[] }

export default function EventChecklist({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}/checklist`).then(r => r.json()),
      fetch('/api/settings/checklist-templates').then(r => r.json()),
    ]).then(([chk, tpls]) => {
      setItems(Array.isArray(chk) ? chk : []);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setLoading(false);
    });
  }, [eventId]);

  async function toggle(item: Item) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i));
    await fetch(`/api/events/${eventId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: !item.isCompleted }),
    });
  }

  async function addItem() {
    if (!newLabel.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/events/${eventId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    if (res.ok) {
      const item = await res.json();
      setItems(prev => [...prev, item]);
      setNewLabel('');
    }
    setAdding(false);
  }

  async function applyTemplate(tpl: Template) {
    setShowTemplates(false);
    const res = await fetch(`/api/events/${eventId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: tpl.id }),
    });
    if (res.ok) {
      const refreshed = await fetch(`/api/events/${eventId}/checklist`).then(r => r.json());
      setItems(Array.isArray(refreshed) ? refreshed : []);
    }
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/events/${eventId}/checklist/${id}`, { method: 'DELETE' });
  }

  const done = items.filter(i => i.isCompleted).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-gray-400" />
            <CardTitle>Checklist</CardTitle>
            {items.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">{done}/{items.length} done</span>
            )}
          </div>
          {templates.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowTemplates(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand border border-gray-200 hover:border-brand rounded-lg px-2.5 py-1.5 transition-colors"
              >
                Apply Template <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[180px]">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                    >
                      <p className="font-medium text-gray-800">{tpl.name}</p>
                      <p className="text-xs text-gray-400">{tpl.items.length} items</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <p className="text-sm text-gray-400 py-2">Loading…</p>
        ) : (
          <>
            {items.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No checklist items yet. Add items below or apply a template.</p>
            )}
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 group py-1.5">
                <button onClick={() => toggle(item)} className="shrink-0 text-gray-400 hover:text-brand transition-colors">
                  {item.isCompleted
                    ? <CheckSquare className="w-5 h-5 text-green-500" />
                    : <Square className="w-5 h-5" />}
                </button>
                <span className={`flex-1 text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {item.label}
                </span>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-3 border-t border-gray-100 mt-2">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Add a task…"
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <Button size="sm" onClick={addItem} disabled={adding || !newLabel.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
