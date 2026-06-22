'use client';
import { Bell, X, Calendar, DollarSign, FileText, User, MessageSquare } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

type Notification = {
  id: string;
  type: 'lead' | 'reply' | 'booking' | 'payment' | 'contract';
  title: string;
  body: string;
  href?: string;
  createdAt: string;
};

const icons: Record<string, React.ElementType> = {
  lead: User,
  reply: MessageSquare,
  booking: Calendar,
  payment: DollarSign,
  contract: FileText,
};

const colors: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-600',
  reply: 'bg-orange-100 text-orange-600',
  booking: 'bg-green-100 text-green-600',
  payment: 'bg-emerald-100 text-emerald-600',
  contract: 'bg-purple-100 text-purple-600',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch on mount so the badge count is accurate before the dropdown is opened
  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => setNotifications(d || []))
      .catch(() => {});
  }, []);

  // Refresh the list each time the dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => { setNotifications(d || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open]);

  const unread = notifications.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">Recent Activity</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No recent activity</div>
            ) : (
              notifications.map(n => {
                const Icon = icons[n.type] || Bell;
                const inner = (
                  <div className="flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${colors[n.type] || 'bg-gray-100 text-gray-500'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => setOpen(false)}>{inner}</Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
