'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Eye, ExternalLink, Calendar, FileText, Lock } from 'lucide-react';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';
import { format } from 'date-fns';

interface Post {
  id?: string;
  slug: string;
  title: string;
  description: string;
  readingTime: number;
  publishedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  source: 'db' | 'file';
}

function postStatus(post: Post): 'published' | 'scheduled' | 'draft' {
  if (!post.publishedAt) return 'draft';
  if (new Date(post.publishedAt) > new Date()) return 'scheduled';
  return 'published';
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'default'> = {
  published: 'success',
  scheduled: 'warning',
  draft: 'default',
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function BlogManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', description: '', content: '', publishedAt: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/super-admin/blog');
    if (r.ok) setPosts(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ slug: '', title: '', description: '', content: '<p>Write your post here...</p>', publishedAt: '' });
    setPreview(false);
    setShowModal(true);
  }

  async function openEdit(p: Post) {
    if (!p.id) return;
    setEditing(p);
    setPreview(false);
    setForm({ slug: p.slug, title: p.title, description: p.description, content: '', publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 16) : '' });
    setShowModal(true);
    const r = await fetch(`/api/super-admin/blog/${p.id}`);
    if (r.ok) {
      const full = await r.json();
      setForm(f => ({ ...f, content: full.content ?? '' }));
    }
  }

  async function save() {
    if (!form.slug.trim() || !form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const body = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      content: form.content,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
    };
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? `/api/super-admin/blog/${editing.id}` : '/api/super-admin/blog';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { await load(); setShowModal(false); }
    setSaving(false);
  }

  async function publishNow(p: Post) {
    if (!p.id) return;
    await fetch(`/api/super-admin/blog/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishedAt: new Date().toISOString() }),
    });
    await load();
  }

  async function setDraft(p: Post) {
    if (!p.id) return;
    await fetch(`/api/super-admin/blog/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishedAt: null }),
    });
    await load();
  }

  async function remove(p: Post) {
    if (!p.id) return;
    if (!confirm(`Delete "${p.title}"?`)) return;
    await fetch(`/api/super-admin/blog/${p.id}`, { method: 'DELETE' });
    await load();
  }

  const dbCount = posts.filter(p => p.source === 'db').length;
  const fileCount = posts.filter(p => p.source === 'file').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {posts.length} post{posts.length !== 1 ? 's' : ''}
          {fileCount > 0 && <span className="ml-1 text-gray-400">({fileCount} from files, {dbCount} from DB)</span>}
        </p>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Post</Button>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p className="font-medium mb-1">No blog posts yet</p>
          <p className="text-sm mb-4">Create your first post to attract organic traffic</p>
          <Button onClick={openCreate}>Write First Post</Button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {posts.map((p, i) => {
            const status = postStatus(p);
            const isFile = p.source === 'file';
            return (
              <div key={p.id ?? p.slug} className={`flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between px-5 py-4 ${isFile ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 truncate">{p.title}</p>
                    <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
                    {isFile && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        <Lock className="w-2.5 h-2.5"/>MDX file
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    <span className="font-mono">/{p.slug}</span>
                    {p.publishedAt && (
                      <span className="ml-3 inline-flex items-center gap-0.5">
                        <Calendar className="w-3 h-3"/>
                        {status === 'scheduled'
                          ? <span className="text-amber-600 font-medium">Schedules {format(new Date(p.publishedAt), 'MMM d, yyyy')}</span>
                          : format(new Date(p.publishedAt), 'MMM d, yyyy')}
                      </span>
                    )}
                    <span className="ml-3">{p.readingTime} min read</span>
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                  {status === 'published' && (
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
                      <ExternalLink className="w-3 h-3"/>View
                    </a>
                  )}
                  {!isFile && status !== 'published' && (
                    <Button size="sm" variant="outline" onClick={() => publishNow(p)}>Publish Now</Button>
                  )}
                  {!isFile && status !== 'draft' && (
                    <Button size="sm" variant="ghost" onClick={() => setDraft(p)}>Revert to Draft</Button>
                  )}
                  {!isFile && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  )}
                  {!isFile && (
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => remove(p)}><Trash2 className="w-4 h-4"/></Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fileCount > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Lock className="w-3 h-3"/><strong>MDX file</strong> posts are read-only — edit them in <code className="font-mono">content/blog/</code> to change content or schedule.
        </p>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Post' : 'New Post'} className="max-w-4xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <Input value={form.title} onChange={e => {
                set('title', e.target.value);
                if (!editing) set('slug', slugify(e.target.value));
              }} placeholder="Why Photo Booth Operators Need a CRM"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <Input value={form.slug} onChange={e => set('slug', slugify(e.target.value))} placeholder="why-photo-booth-operators-need-a-crm"/>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description for search engines (150–160 chars)"/>
            <p className="text-xs text-gray-400 mt-1">{form.description.length}/160 characters</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Publish Date / Time</label>
            <Input type="datetime-local" value={form.publishedAt} onChange={e => set('publishedAt', e.target.value)} className="w-64"/>
            <p className="text-xs text-gray-400 mt-1">Leave empty to save as draft. Set a future date to schedule.</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Content *</label>
              <button type="button" onClick={() => setPreview(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
                <Eye className="w-3 h-3"/>{preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="border border-gray-200 rounded-xl p-6 min-h-48 blog-prose bg-white overflow-auto"
                dangerouslySetInnerHTML={{ __html: form.content }}/>
            ) : (
              <EmailTemplateEditor value={form.content} onChange={v => set('content', v)} mergeTags={[]}/>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.slug.trim() || !form.title.trim() || !form.content.trim()}>
              {saving ? 'Saving…' : editing ? 'Update Post' : 'Create Post'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
