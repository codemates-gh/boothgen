'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

// Client Design Brief switches. Shown in Settings → Booth Templates, or in Genie → Templates for Genie accounts.
export function DesignBriefSettings() {
  const [designBriefEnabled, setDesignBriefEnabled] = useState(false);
  const [customDesignEnabled, setCustomDesignEnabled] = useState(false);
  const [autoActivate, setAutoActivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/design-brief-settings').then(r => r.json()).then(d => {
      setDesignBriefEnabled(d.designBriefEnabled);
      setCustomDesignEnabled(d.customDesignEnabled);
      setAutoActivate(!!d.designBriefAutoActivate);
    });
  }, []);

  async function saveSettings() {
    setSaving(true);
    await fetch('/api/settings/design-brief-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designBriefEnabled, customDesignEnabled, designBriefAutoActivate: autoActivate }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative mt-0.5">
            <input type="checkbox" className="sr-only" checked={designBriefEnabled} onChange={e => setDesignBriefEnabled(e.target.checked)}/>
            <div className={`w-10 h-6 rounded-full transition-colors ${designBriefEnabled ? 'bg-brand' : 'bg-gray-200'}`}/>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${designBriefEnabled ? 'translate-x-5' : 'translate-x-1'}`}/>
          </div>
          <div>
            <p className="font-medium text-sm">Enable Design Brief</p>
            <p className="text-xs text-gray-500 mt-0.5">Show the design brief flow in the client portal. Activate it per event on the Designs tab, or turn it on for every event below.</p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative mt-0.5">
            <input type="checkbox" className="sr-only" checked={autoActivate} onChange={e => setAutoActivate(e.target.checked)}/>
            <div className={`w-10 h-6 rounded-full transition-colors ${autoActivate ? 'bg-brand' : 'bg-gray-200'}`}/>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoActivate ? 'translate-x-5' : 'translate-x-1'}`}/>
          </div>
          <div>
            <p className="font-medium text-sm">Turn on for every event automatically</p>
            <p className="text-xs text-gray-500 mt-0.5">Clients see the layout picker on their Design tab without you activating it on each event.</p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative mt-0.5">
            <input type="checkbox" className="sr-only" checked={customDesignEnabled} onChange={e => setCustomDesignEnabled(e.target.checked)}/>
            <div className={`w-10 h-6 rounded-full transition-colors ${customDesignEnabled ? 'bg-brand' : 'bg-gray-200'}`}/>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${customDesignEnabled ? 'translate-x-5' : 'translate-x-1'}`}/>
          </div>
          <div>
            <p className="font-medium text-sm">Allow Custom Design Request</p>
            <p className="text-xs text-gray-500 mt-0.5">Clients can skip the template picker and describe a fully custom design instead.</p>
          </div>
        </label>

        <Button onClick={saveSettings} disabled={saving} size="sm">
          {saved ? <><CheckCircle className="w-4 h-4 mr-1.5"/>Saved</> : saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
