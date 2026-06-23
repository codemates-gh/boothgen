'use client';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function SuperAdminSignOut() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto text-white/70 hover:text-white hover:bg-white/10"
      onClick={() => signOut({ callbackUrl: '/sign-in' })}
    >
      <LogOut className="w-4 h-4 mr-1.5" />
      Sign Out
    </Button>
  );
}
