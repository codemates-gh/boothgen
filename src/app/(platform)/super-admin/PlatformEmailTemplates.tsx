'use client';
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Eye, EyeOff, Mail } from 'lucide-react';

const TEMPLATES = [
  {
    key: 'email_template_welcome',
    label: 'Welcome Email',
    description: 'Sent when a new user signs up',
    vars: ['user_name', 'app_url'],
    defaultSubject: 'Welcome to Booth Genius!',
    defaultBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
  <h2 style="font-size:22px;color:#111827">Welcome to Booth Genius, {{user_name}}!</h2>
  <p style="color:#374151">We're thrilled to have you on board. Your account is ready — set up your company profile and start managing your photo booth business in minutes.</p>
  <p style="margin:28px 0">
    <a href="{{app_url}}/onboarding" style="background:#F97316;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Get Started</a>
  </p>
  <p style="color:#6b7280;font-size:13px;">If you have any questions, just reply to this email — we're here to help.</p>
  <p style="color:#6b7280;font-size:13px;">— The Booth Genius Team</p>
</div>`,
  },
  {
    key: 'email_template_forgot_password',
    label: 'Forgot Password',
    description: 'Sent when a user requests a password reset',
    vars: ['user_name', 'reset_url', 'app_url'],
    defaultSubject: 'Reset your Booth Genius password',
    defaultBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
  <h2 style="font-size:20px;color:#111827">Hi {{user_name}},</h2>
  <p>We received a request to reset the password for your Booth Genius account.</p>
  <p style="margin:24px 0">
    <a href="{{reset_url}}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
  </p>
  <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
</div>`,
  },
];

interface TemplateValue { subject: string; bodyHtml: string }

interface Props {
  initial: Record<string, string>;
}

function renderPreview(html: string, vars: string[]) {
  let out = html;
  const samples: Record<string, string> = {
    user_name: 'Jane Smith',
    app_url: 'https://boothgen.com',
    reset_url: 'https://boothgen.com/reset-password?token=preview',
  };
  vars.forEach(v => { out = out.replaceAll(`{{${v}}}`, `<mark style="background:#FEF9C3;padding:0 2px;border-radius:2px">${samples[v] ?? `{{${v}}}`}</mark>`); });
  return out;
}

export default function PlatformEmailTemplates({ initial }: Props) {
  const [activeKey, setActiveKey] = useState(TEMPLATES[0].key);
  const [values, setValues] = useState<Record<string, TemplateValue>>(() => {
    const out: Record<string, TemplateValue> = {};
    for (const tpl of TEMPLATES) {
      try {
        const parsed = initial[tpl.key] ? JSON.parse(initial[tpl.key]) : null;
        out[tpl.key] = { subject: parsed?.subject ?? tpl.defaultSubject, bodyHtml: parsed?.bodyHtml ?? tpl.defaultBody };
      } catch {
        out[tpl.key] = { subject: tpl.defaultSubject, bodyHtml: tpl.defaultBody };
      }
    }
    return out;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const activeTpl = TEMPLATES.find(t => t.key === activeKey)!;
  const current = values[activeKey];

  function updateCurrent(patch: Partial<TemplateValue>) {
    setValues(v => ({ ...v, [activeKey]: { ...v[activeKey], ...patch } }));
  }

  function insertVar(v: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const tag = `{{${v}}}`;
    const newVal = current.bodyHtml.slice(0, start) + tag + current.bodyHtml.slice(end);
    updateCurrent({ bodyHtml: newVal });
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + tag.length;
      el.focus();
    });
  }

  async function save() {
    setSaving(activeKey);
    await fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [activeKey]: JSON.stringify(current) }),
    });
    setSaving(null);
    setSaved(activeKey);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="w-4 h-4" />Platform Email Templates</CardTitle>
        <p className="text-sm text-gray-500">Customize system emails sent by Booth Genius. Use variables to personalize content.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template tabs */}
        <div className="flex gap-2 border-b">
          {TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => { setActiveKey(t.key); setPreview(false); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeKey === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400">{activeTpl.description}</p>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={current.subject}
            onChange={e => updateCurrent({ subject: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Variable chips */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Available variables — click to insert into body:</p>
          <div className="flex flex-wrap gap-1.5">
            {activeTpl.vars.map(v => (
              <button
                key={v}
                onClick={() => insertVar(v)}
                className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2.5 py-0.5 hover:bg-orange-100 font-mono transition-colors"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Body editor / preview toggle */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Body (HTML)</label>
            <button onClick={() => setPreview(p => !p)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
              {preview ? <><EyeOff className="w-3.5 h-3.5" />Edit</> : <><Eye className="w-3.5 h-3.5" />Preview</>}
            </button>
          </div>
          {preview ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="bg-gray-50 border-b px-3 py-1.5 text-xs text-gray-400">Preview (variables highlighted)</div>
              <iframe
                srcDoc={renderPreview(current.bodyHtml, activeTpl.vars)}
                className="w-full min-h-[280px]"
                sandbox="allow-same-origin"
                title="Email preview"
              />
            </div>
          ) : (
            <textarea
              ref={bodyRef}
              value={current.bodyHtml}
              onChange={e => updateCurrent({ bodyHtml: e.target.value })}
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand resize-y"
              placeholder="Enter HTML email body..."
            />
          )}
        </div>

        <Button onClick={save} disabled={saving === activeKey} size="sm">
          <Save className="w-4 h-4 mr-1.5" />
          {saving === activeKey ? 'Saving…' : saved === activeKey ? 'Saved!' : 'Save Template'}
        </Button>
      </CardContent>
    </Card>
  );
}
