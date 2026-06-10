'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera } from 'lucide-react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { update } = useSession();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create company');
      // Refresh JWT so tenantId is included in session
      await update();
      router.push('/dashboard');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Welcome to Photo Booth CRM</h1>
            <p className="text-sm text-gray-500">Let's set up your company</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pixel Perfect Photo Booths" onKeyDown={e => e.key === 'Enter' && handleCreate()} disabled={loading} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating your company...' : 'Create My Company →'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">You can invite team members and customize branding in settings.</p>
      </div>
    </div>
  );
}
