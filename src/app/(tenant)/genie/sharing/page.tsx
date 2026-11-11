'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Mail, Send, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';


type Config = {
  sms: { configured: boolean; accountSid: string; authTokenMasked: string | null; messagingServiceSid: string; fromNumber: string; testedAt: string | null; testError: string | null };
  email: {
    configured: boolean; provider: 'resend' | 'smtp' | null; fromName: string; fromAddress: string; resendApiKeyMasked: string | null;
    smtpHost: string; smtpPort: number | null; smtpSecurity: 'tls' | 'starttls' | 'none'; smtpUsername: string; smtpPasswordMasked: string | null;
    testedAt: string | null; testError: string | null; domainError: string | null;
  };
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Status({ configured, testedAt, testError, domainError }: { configured: boolean; testedAt: string | null; testError: string | null; domainError?: string | null }) {
  if (domainError) return <Badge variant="danger">Can&apos;t send</Badge>;
  if (!configured) return <Badge variant="default">Not set up</Badge>;
  if (testError) return <Badge variant="danger">Test failed</Badge>;
  if (testedAt) return <Badge variant="success">Tested</Badge>;
  return <Badge variant="warning">Not tested</Badge>;
}

function TestResult({ result }: { result: { ok: boolean; error?: string } | null }) {
  if (!result) return null;
  return result.ok ? (
    <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0"/>Sent. Check that it arrived.</div>
  ) : (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0"/><span className="break-words">{result.error}</span></div>
  );
}

export default function GenieSharingPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [sms, setSms] = useState({ accountSid: '', authToken: '', messagingServiceSid: '', fromNumber: '' });
  const [email, setEmail] = useState({ provider: 'resend' as 'resend' | 'smtp', fromName: '', fromAddress: '', resendApiKey: '', smtpHost: '', smtpPort: '587', smtpSecurity: 'starttls' as 'tls' | 'starttls' | 'none', smtpUsername: '', smtpPassword: '' });
  const [saving, setSaving] = useState<'sms' | 'email' | null>(null);
  const [saveError, setSaveError] = useState<{ sms?: string; email?: string }>({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [testTo, setTestTo] = useState({ sms: '', email: '' });
  const [testing, setTesting] = useState<'sms' | 'email' | null>(null);
  const [testResult, setTestResult] = useState<{ sms: { ok: boolean; error?: string } | null; email: { ok: boolean; error?: string } | null }>({ sms: null, email: null });

  useEffect(() => { load(); }, []);

  function apply(c: Config) {
    setConfig(c);
    setSms({ accountSid: c.sms.accountSid, authToken: '', messagingServiceSid: c.sms.messagingServiceSid, fromNumber: c.sms.fromNumber });
    setEmail({
      provider: c.email.provider ?? 'resend', fromName: c.email.fromName, fromAddress: c.email.fromAddress, resendApiKey: '',
      smtpHost: c.email.smtpHost, smtpPort: String(c.email.smtpPort ?? 587), smtpSecurity: c.email.smtpSecurity, smtpUsername: c.email.smtpUsername, smtpPassword: '',
    });
  }

  async function load() {
    const r = await fetch('/api/settings/genie-messaging');
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) apply(await r.json());
  }

  async function save(channel: 'sms' | 'email', remove = false) {
    if (remove && !confirm(`Remove your ${channel === 'sms' ? 'Twilio' : 'email'} settings? Guests won't be able to receive ${channel === 'sms' ? 'texts' : 'emails'} until you set it up again.`)) return;
    setSaving(channel); setSaveError(e => ({ ...e, [channel]: undefined })); if (channel === 'email') setSaveNotice(null);
    const payload = remove ? { [channel]: null } : channel === 'sms'
      ? { sms: { ...sms, authToken: sms.authToken || undefined } }
      : { email: { ...email, smtpPort: email.provider === 'smtp' ? Number(email.smtpPort) || null : null, resendApiKey: email.resendApiKey || undefined, smtpPassword: email.smtpPassword || undefined } };
    const r = await fetch('/api/settings/genie-messaging', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { apply(d); setTestResult(t => ({ ...t, [channel]: null })); if (channel === 'email') setSaveNotice(d.notice ?? null); }
    else setSaveError(e => ({ ...e, [channel]: d.error || 'Could not save' }));
    setSaving(null);
  }

  async function sendTest(channel: 'sms' | 'email') {
    setTesting(channel); setTestResult(t => ({ ...t, [channel]: null }));
    const r = await fetch('/api/settings/genie-messaging/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, to: testTo[channel] }) });
    const d = await r.json().catch(() => ({ ok: false, error: 'Request failed' }));
    setTestResult(t => ({ ...t, [channel]: d }));
    setTesting(null);
    load();
  }

  return (
    <>
      <TopBar title="Genie Sharing" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        {notEnabled ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
              <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
              <p className="text-sm">Genie runs your iPad photo booth and texts or emails guests their photos. Contact support to enable it for your account.</p>
            </CardContent>
          </Card>
        ) : !config ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">Guest Messaging</h2>
              <p className="text-sm text-gray-500">Genie sends guests their photos from your own Twilio and email accounts. A channel you haven&apos;t set up is hidden on the iPad.</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><MessageSquare className="w-4 h-4"/>Text Messages (Twilio)</CardTitle>
                  <Status {...config.sms}/>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Account SID"><Input value={sms.accountSid} onChange={e => setSms(s => ({ ...s, accountSid: e.target.value.trim() }))} placeholder="AC…"/></Field>
                  <Field label="Auth Token" hint={config.sms.authTokenMasked ? 'Saved ' + config.sms.authTokenMasked + ' — leave blank to keep it' : undefined}>
                    <Input type="password" autoComplete="off" value={sms.authToken} onChange={e => setSms(s => ({ ...s, authToken: e.target.value }))} placeholder={config.sms.authTokenMasked ? 'Enter a new token to replace' : ''}/>
                  </Field>
                  <Field label="Messaging Service SID (optional)" hint="Leave blank to send from your From number. If set, texts go through this Messaging Service instead.">
                    <Input value={sms.messagingServiceSid} onChange={e => setSms(s => ({ ...s, messagingServiceSid: e.target.value.trim() }))} placeholder="MG…"/>
                  </Field>
                  <Field label="From Number"><Input value={sms.fromNumber} onChange={e => setSms(s => ({ ...s, fromNumber: e.target.value }))} placeholder="240-555-0123"/></Field>
                </div>
                {saveError.sms && <p className="text-sm text-red-600">{saveError.sms}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => save('sms')} disabled={saving === 'sms' || !sms.accountSid}>{saving === 'sms' ? 'Saving…' : 'Save'}</Button>
                  {config.sms.configured && <Button variant="ghost" className="text-[#E2445C] hover:text-[#CC3A52] hover:bg-red-50" onClick={() => save('sms', true)}>Remove</Button>}
                </div>
                {config.sms.configured && (
                  <div className="border-t pt-4 space-y-3">
                    <Field label="Send a test text to">
                      <div className="flex gap-2">
                        <Input value={testTo.sms} onChange={e => setTestTo(t => ({ ...t, sms: e.target.value }))} placeholder="202-555-0123"/>
                        <Button variant="outline" onClick={() => sendTest('sms')} disabled={testing === 'sms' || !testTo.sms} className="shrink-0"><Send className="w-3.5 h-3.5 mr-1.5"/>{testing === 'sms' ? 'Sending…' : 'Send Test'}</Button>
                      </div>
                    </Field>
                    <TestResult result={testResult.sms ?? (config.sms.testError ? { ok: false, error: 'Last test failed: ' + config.sms.testError } : null)}/>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Mail className="w-4 h-4"/>Email</CardTitle>
                  <Status {...config.email}/>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.email.domainError && (
                  <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                    <span>{config.email.domainError} Guests won&apos;t get emails until you save an address on your own domain.</span>
                  </div>
                )}
                <Field label="Provider">
                  <Select value={email.provider} onChange={e => setEmail(s => ({ ...s, provider: e.target.value as 'resend' | 'smtp' }))}>
                    <option value="resend">Resend</option>
                    <option value="smtp">SMTP</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="From Name"><Input value={email.fromName} onChange={e => setEmail(s => ({ ...s, fromName: e.target.value }))} placeholder="Your company name"/></Field>
                  <Field label="From Address" hint={email.provider === 'resend' ? 'Use an address on your own domain, verified in your Resend account. We check this when you save.' : 'Use an address on your own domain.'}>
                    <Input type="email" value={email.fromAddress} onChange={e => setEmail(s => ({ ...s, fromAddress: e.target.value.trim() }))} placeholder="photos@yourdomain.com"/>
                  </Field>
                </div>
                {email.provider === 'resend' ? (
                  <Field label="Resend API Key" hint={config.email.resendApiKeyMasked ? 'Saved ' + config.email.resendApiKeyMasked + ' — leave blank to keep it' : undefined}>
                    <Input type="password" autoComplete="off" value={email.resendApiKey} onChange={e => setEmail(s => ({ ...s, resendApiKey: e.target.value }))} placeholder={config.email.resendApiKeyMasked ? 'Enter a new key to replace' : 're_…'}/>
                  </Field>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="SMTP Host"><Input value={email.smtpHost} onChange={e => setEmail(s => ({ ...s, smtpHost: e.target.value.trim() }))} placeholder="smtp.yourprovider.com"/></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Port"><Input type="number" value={email.smtpPort} onChange={e => setEmail(s => ({ ...s, smtpPort: e.target.value }))}/></Field>
                      <Field label="Security">
                        <Select value={email.smtpSecurity} onChange={e => setEmail(s => ({ ...s, smtpSecurity: e.target.value as 'tls' | 'starttls' | 'none' }))}>
                          <option value="starttls">STARTTLS</option>
                          <option value="tls">TLS / SSL</option>
                          <option value="none">None</option>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Username"><Input autoComplete="off" value={email.smtpUsername} onChange={e => setEmail(s => ({ ...s, smtpUsername: e.target.value }))}/></Field>
                    <Field label="Password" hint={config.email.smtpPasswordMasked ? 'Saved — leave blank to keep it' : undefined}>
                      <Input type="password" autoComplete="new-password" value={email.smtpPassword} onChange={e => setEmail(s => ({ ...s, smtpPassword: e.target.value }))} placeholder={config.email.smtpPasswordMasked ? 'Enter a new password to replace' : ''}/>
                    </Field>
                  </div>
                )}
                {saveError.email && <p className="text-sm text-red-600">{saveError.email}</p>}
                {saveNotice && <p className="text-sm text-amber-600">{saveNotice}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => save('email')} disabled={saving === 'email' || !email.fromAddress}>{saving === 'email' ? 'Saving…' : 'Save'}</Button>
                  {config.email.configured && <Button variant="ghost" className="text-[#E2445C] hover:text-[#CC3A52] hover:bg-red-50" onClick={() => save('email', true)}>Remove</Button>}
                </div>
                {config.email.configured && (
                  <div className="border-t pt-4 space-y-3">
                    <Field label="Send a test email to">
                      <div className="flex gap-2">
                        <Input type="email" value={testTo.email} onChange={e => setTestTo(t => ({ ...t, email: e.target.value.trim() }))} placeholder="you@example.com"/>
                        <Button variant="outline" onClick={() => sendTest('email')} disabled={testing === 'email' || !testTo.email} className="shrink-0"><Send className="w-3.5 h-3.5 mr-1.5"/>{testing === 'email' ? 'Sending…' : 'Send Test'}</Button>
                      </div>
                    </Field>
                    <TestResult result={testResult.email ?? (config.email.testError ? { ok: false, error: 'Last test failed: ' + config.email.testError } : null)}/>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
