'use client';
import { Bell, X, Calendar, DollarSign, FileText, User, MessageSquare, CheckCheck } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
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

const STORAGE_KEY = 'boothgen_read_notifications';
const POLL_INTERVAL = 30_000;

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Pleasant C major arpeggio: C5 → E5 → G5
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  } catch {}
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  // Load read IDs from localStorage on mount
  useEffect(() => {
    setReadIds(loadReadIds());
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchNotifications = useCallback((isPolling = false) => {
    return fetch('/api/notifications')
      .then(r => r.json())
      .then((data: Notification[]) => {
        const items = data || [];

        // Detect genuinely new IDs (not present in previous fetch)
        if (isPolling && initialLoadDone.current) {
          const hasNew = items.some(n => !prevIdsRef.current.has(n.id));
          if (hasNew) playChime();
        }

        prevIdsRef.current = new Set(items.map(n => n.id));
        initialLoadDone.current = true;
        setNotifications(items);
      })
      .catch(() => {});
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  // Poll every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => fetchNotifications(true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Refresh when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchNotifications(false).finally(() => setLoading(false));
  }, [open, fetchNotifications]);

  function markRead(id: string) {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    saveReadIds(next);
  }

  function markAllRead() {
    const next = new Set([...readIds, ...notifications.map(n => n.id)]);
    setReadIds(next);
    saveReadIds(next);
  }

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">
              Recent Activity
              {unreadCount > 0 && (
                <span className="ml-2 text-xs text-gray-400 font-normal">{unreadCount} unread</span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No recent activity</div>
            ) : (
              notifications.map(n => {
                const Icon = icons[n.type] || Bell;
                const isUnread = !readIds.has(n.id);

                const inner = (
                  <div
                    className={`flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${isUnread ? 'bg-orange-50/40' : ''}`}
                    onClick={() => markRead(n.id)}
                  >
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colors[n.type] || 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );

                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => { markRead(n.id); setOpen(false); }}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && unreadCount === 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50 text-center">
              <p className="text-xs text-gray-400">All caught up</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
