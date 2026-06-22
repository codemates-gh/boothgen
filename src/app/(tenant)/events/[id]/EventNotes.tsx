'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StickyNote, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Note {
  id: string;
  body: string;
  userName: string;
  createdAt: string;
}

export default function EventNotes({ eventId }: { eventId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    const r = await fetch('/api/events/' + eventId + '/notes');
    if (r.ok) setNotes(await r.json());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const r = await fetch('/api/events/' + eventId + '/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      setBody('');
      await load();
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="w-4 h-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <Button type="submit" size="sm" disabled={saving || !body.trim()} className="mb-0.5">
            <Send className="w-4 h-4" />
          </Button>
        </form>

        {notes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No notes yet</p>
        ) : (
          <div className="space-y-3">
            {notes.map(n => (
              <div key={n.id} className="bg-gray-50 rounded-xl p-3 space-y-1">
                <p className="text-sm text-gray-800">{n.body}</p>
                <p className="text-xs text-gray-400">
                  {n.userName} · {new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {' '}({formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })})
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
