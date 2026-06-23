'use client';
import { useState } from 'react';

interface Module { id: string; label: string; desc: string }

export function TeamAccessForm({ modules, currentAccess }: { modules: Module[]; currentAccess: string[] }) {
  const [selected, setSelected] = useState<string[]>(currentAccess);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch('/api/settings/team/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: selected }),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modules.map(m => {
          const on = selected.includes(m.id);
          return (
            <label key={m.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${on ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300'}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(m.id)}
                className="mt-0.5 accent-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 bg-brand text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saving ? 'Saving…' : 'Save Access Settings'}
        </button>
        {saved && <p className="text-sm text-green-600 font-medium">Saved ✓</p>}
      </div>
      <p className="text-xs text-gray-400">Changes take effect the next time a team member logs in or refreshes their page.</p>
    </div>
  );
}
