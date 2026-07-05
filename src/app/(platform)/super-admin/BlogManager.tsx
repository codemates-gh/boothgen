'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink, Calendar, FileText, Lock } from 'lucide-react';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';
import { format } from 'date-fns';

interface Post {
  id?: string;
  slug: string;
  title: string;
  description: string;
  readingTime: number;
  publishedAt: string | null;
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
  const [expandedSlugs, setExpandedSlugs] = useState<Record<string, string | null>>({});
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await fetch('/api/super-admin/blog');
    if (r.ok) setPosts(await r.json());
  }

  async function toggleView(slug: string) {
    if (slug in expandedSlugs) {
      setExpandedSlugs(e => { const n = { ...e }; delete n[slug]; return n; });
      return;
    }
    setExpandedSlugs(e => ({ ...e, [slug]: null }));
    const r = await fetch(`/api/super-admin/blog/file-source?slug=${encodeURIComponent(slug)}`);
    if (r.ok) {
      const { raw } = await r.json();
      setExpandedSlugs(e => ({ ...e, [slug]: raw }));
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ slug: '', title: '', description: '', content: '<p>Write your post here...</p>', publishedAt: '' });
    setPreview(false);
    setShowModal(true);
  }

  // Override: pre-fill metadata from the file post, leave body for user to write
  function openOverride(p: Post) {
    setEditing(null);
    setForm({
      slug: p.slug,
      title: p.title,
      description: p.description,
      content: '<p></p>',
      publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 16) : '',
    });
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

  const now = new Date();
  const publishedCount = posts.filter(p => p.publishedAt && new Date(p.publishedAt) <= now).length;
  const scheduledCount = posts.filter(p => p.publishedAt && new Date(p.publishedAt) > now).length;
  const fileCount = posts.filter(p => p.source === 'file').length;

  return (
    <div className="space-y-4">
      {/* Stats + action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {posts.length} total · {publishedCount} published · {scheduledCount} scheduled
          {fileCount > 0 && <span className="ml-2 font-medium text-brand">{fileCount} auto-scheduled from files</span>}
        </p>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Post</Button>
      </div>

      {/* File-post info banner */}
      {fileCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-800 leading-relaxed">
          <strong>File-based posts</strong> publish automatically on their scheduled date. To edit one before it goes live, click <strong>Override</strong> — this pre-fills the editor with the post&apos;s metadata so you can write the body in the WYSIWYG. The DB version takes precedence over the file.
        </div>
      )}

      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p className="font-medium mb-1">No blog posts yet</p>
          <p className="text-sm mb-4">Create your first post to attract organic traffic</p>
          <Button onClick={openCreate}>Write First Post</Button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {posts.map(p => {
            const status = postStatus(p);
            const isFile = p.source === 'file';
            const isExpanded = p.slug in expandedSlugs;
            const rawSource = expandedSlugs[p.slug];

            return (
              <div key={p.id ?? p.slug} className={isFile ? 'bg-gray-50/40' : ''}>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between px-5 py-4">
                  {/* Left: date + meta */}
                  <div className="flex gap-4 min-w-0">
                    {p.publishedAt && (
                      <div className="flex-shrink-0 w-24 text-xs text-gray-400 pt-0.5">
                        <span className={status === 'scheduled' ? 'font-medium text-amber-600' : ''}>
                          {format(new Date(p.publishedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
                        {isFile && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                            <Lock className="w-2.5 h-2.5"/>FILE
                          </span>
                        )}
                        <p className="font-semibold text-sm text-gray-900">{p.title}</p>
                      </div>
                      <p className="text-xs text-gray-400 font-mono">/blog/{p.slug}</p>
                      {p.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{p.description.slice(0, 100)}{p.description.length > 100 ? '…' : ''}</p>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex gap-2 flex-shrink-0 flex-wrap items-center">
                    <button
                      onClick={() => toggleView(p.slug)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                      {isExpanded ? <><EyeOff className="w-3 h-3"/>Hide</> : <><Eye className="w-3 h-3"/>View</>}
                    </button>

                    {status === 'published' && (
                      <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
                        <ExternalLink className="w-3 h-3"/>Live
                      </a>
                    )}

                    {isFile && (
                      <Button size="sm" variant="outline" onClick={() => openOverride(p)}>Override</Button>
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

                {/* Inline raw MDX preview */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                      RAW MDX SOURCE — read-only preview
                    </p>
                    {rawSource === null ? (
                      <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
                    ) : (
                      <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-5 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg p-4">
                        {rawSource}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Editor modal */}
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
