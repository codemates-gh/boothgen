'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Mail } from 'lucide-react';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';

const TEMPLATES = [
  {
    key: 'email_template_welcome',
    label: 'Welcome Email',
    description: 'Sent when a new user signs up',
    mergeTags: [
      { label: 'User Name', value: '{{user_name}}' },
      { label: 'App URL', value: '{{app_url}}' },
    ],
    previewSamples: {
      '{{user_name}}': 'Jane Smith',
      '{{app_url}}': 'https://boothgen.com',
    } as Record<string, string>,
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
    mergeTags: [
      { label: 'User Name', value: '{{user_name}}' },
      { label: 'Reset Link', value: '{{reset_url}}' },
      { label: 'App URL', value: '{{app_url}}' },
    ],
    previewSamples: {
      '{{user_name}}': 'Jane Smith',
      '{{reset_url}}': 'https://boothgen.com/reset-password?token=preview',
      '{{app_url}}': 'https://boothgen.com',
    },
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
interface Props { initial: Record<string, string> }

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

  const activeTpl = TEMPLATES.find(t => t.key === activeKey)!;
  const current = values[activeKey];

  function updateCurrent(patch: Partial<TemplateValue>) {
    setValues(v => ({ ...v, [activeKey]: { ...v[activeKey], ...patch } }));
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
        <p className="text-sm text-gray-500">Customize system emails sent by Booth Genius. Use the "Insert Variable" button to add dynamic content.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template tabs */}
        <div className="flex gap-2 border-b">
          {TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveKey(t.key)}
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

        {/* WYSIWYG body editor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
          <EmailTemplateEditor
            value={current.bodyHtml}
            onChange={v => updateCurrent({ bodyHtml: v })}
            mergeTags={activeTpl.mergeTags}
            previewSamples={activeTpl.previewSamples}
          />
        </div>

        <Button onClick={save} disabled={saving === activeKey} size="sm">
          <Save className="w-4 h-4 mr-1.5" />
          {saving === activeKey ? 'Saving…' : saved === activeKey ? 'Saved!' : 'Save Template'}
        </Button>
      </CardContent>
    </Card>
  );
}
