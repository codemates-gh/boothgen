'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Trash2, ShieldCheck, ShieldMinus } from 'lucide-react';

const RC: Record<string, any> = { HOST_ADMIN: 'brand', TEAM_MEMBER: 'default' };
const SC: Record<string, any> = { ACTIVE: 'success', INVITED: 'info', SUSPENDED: 'danger' };

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string | null;
  user: { name: string; email: string };
};

export function TeamMembersTable({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(membershipId: string, newRole: string) {
    setLoadingId(membershipId);
    setError(null);
    const res = await fetch(`/api/settings/team/members/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Failed to update role');
    } else {
      router.refresh();
    }
  }

  async function removeMember(membershipId: string) {
    setLoadingId(membershipId);
    setError(null);
    const res = await fetch(`/api/settings/team/members/${membershipId}`, { method: 'DELETE' });
    setLoadingId(null);
    setConfirmDelete(null);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Failed to remove member');
    } else {
      router.refresh();
    }
  }

  return (
    <div className="overflow-x-auto">
      {error && (
        <div className="mx-6 mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
      )}
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
            <th className="px-6 py-3 w-[100px]"></th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const isSelf = m.userId === currentUserId;
            const isLoading = loadingId === m.id;
            const isConfirming = confirmDelete === m.id;

            return (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-6 py-4">
                  <p className="font-medium text-sm">{m.user.name}</p>
                  <p className="text-xs text-gray-400">{m.user.email}</p>
                  {isSelf && <span className="text-xs text-gray-400 italic">(you)</span>}
                </td>
                <td className="px-6 py-4">
                  <Badge variant={RC[m.role]}>{m.role.replace('_', ' ')}</Badge>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={SC[m.status]}>{m.status}</Badge>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {m.joinedAt ? format(new Date(m.joinedAt), 'MMM d, yyyy') : '—'}
                </td>
                <td className="px-6 py-4">
                  {!isSelf && (
                    isConfirming ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600 mr-1">Remove?</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMember(m.id)}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-700 text-xs px-2"
                        >
                          {isLoading ? '…' : 'Yes'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2"
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        {/* Role toggle */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isLoading}
                          onClick={() => changeRole(m.id, m.role === 'HOST_ADMIN' ? 'TEAM_MEMBER' : 'HOST_ADMIN')}
                          title={m.role === 'HOST_ADMIN' ? 'Downgrade to Team Member' : 'Promote to Admin'}
                          className="text-gray-400 hover:text-brand"
                        >
                          {m.role === 'HOST_ADMIN'
                            ? <ShieldMinus className="w-4 h-4" />
                            : <ShieldCheck className="w-4 h-4" />}
                        </Button>
                        {/* Remove */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(m.id)}
                          className="text-gray-400 hover:text-red-600"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
