'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, CheckCircle } from 'lucide-react';

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TEAM_MEMBER');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    const res = await fetch('/api/settings/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setSuccess('Invitation sent to ' + email);
      setEmail('');
    } else {
      setError(data.error || 'Failed to send invitation');
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5"/>Invite Team Member</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="flex-1"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="TEAM_MEMBER">Team Member</option>
              <option value="HOST_ADMIN">Admin</option>
            </select>
            <Button type="submit" disabled={loading || !email}>
              {loading ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
          {success && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
              <CheckCircle className="w-4 h-4" />{success}
            </div>
          )}
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
