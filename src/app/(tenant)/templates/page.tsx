'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Sparkles, Plus, Pencil, Copy, Trash2, LayoutTemplate, Eye, EyeOff } from 'lucide-react';
import { Layout, LayoutPreview, artUrl } from '@/components/genie/parts';

type Template = {
  id: string; name: string; description: string | null; scope: 'standard' | 'mine'; isPublished: boolean; offerToClients: boolean; hidden?: boolean;
  thumbnail: { url: string } | null; layout: Layout | null; alternateLayout: Layout | null;
};
const FORMAT_LABEL: Record<string, string> = { '4x6': '4×6', '2x6': '2×6 strip' };

function Thumb({ t }: { t: Template }) {
  if (t.thumbnail) return <img src={artUrl(t.thumbnail.url)} alt="" className="max-h-40 max-w-full rounded border border-gray-200 object-contain"/>;
  if (t.layout) return <LayoutPreview layout={t.layout} width={t.layout.widthPx >= t.layout.heightPx ? 200 : t.layout.format === '2x6' ? 54 : 108}/>;
  return <div className="h-40 w-28 rounded border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 text-center px-2">No photo frames yet</div>;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [data, setData] = useState<{ standard: Template[]; mine: Template[]; superAdmin: boolean } | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [tab, setTab] = useState<'mine' | 'standard'>('mine');
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/genie-templates');
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  // Standard layouts: hide from this account's library and clients' design picker, or show again
  async function setHidden(t: Template, hidden: boolean) {
    setError('');
    const r = await fetch('/api/template-library/hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: t.id, hidden }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    setData(d => d && ({ ...d, standard: d.standard.map(x => x.id === t.id ? { ...x, hidden } : x) }));
  }

  async function duplicate(t: Template) {
    if (!t.layout) return;
    setBusy(true); setError('');
    const r = await fetch('/api/genie-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: (t.name + ' (copy)').slice(0, 80), scope: 'mine', layout: t.layout, alternateLayout: t.alternateLayout, thumbnail: t.thumbnail, copyFrom: t.id }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not duplicate'); return; }
    router.push('/templates/' + d.id);
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true); setError('');
    const r = await fetch('/api/genie-templates/' + deleting.id, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not delete'); return; }
    setDeleting(null);
    load();
  }

  const list = data ? data[tab] : [];
  return (
    <>
      <TopBar title="Templates"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
        {notEnabled ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
              <p className="font-medium text-gray-700 mb-1">Templates are for account admins</p>
              <p className="text-sm">Ask your account admin to manage print layouts.</p>
            </CardContent>
          </Card>
        ) : !data ? <p className="text-sm text-gray-400">Loading…</p> : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Templates</h2>
                <p className="text-sm text-gray-500 mt-1">Print layouts for your booth. Clients pick from them in their design brief; Genie events use them on the iPad. <Link href="/templates/settings" className="text-brand hover:underline">Template settings</Link></p>
              </div>
              <Link href={tab === 'standard' && data.superAdmin ? '/templates/new?scope=standard' : '/templates/new'}>
                <Button><Plus className="w-4 h-4 mr-1.5"/>New Template</Button>
              </Link>
            </div>

            <div className="flex border-b border-gray-200">
              {(['mine', 'standard'] as const).map(k => (
                <button key={k} onClick={() => setTab(k)} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px ' + (tab === k ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
                  {k === 'mine' ? 'My Templates' : 'Standard'} ({data[k].length})
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}

            {list.length === 0 ? (
              <Card><CardContent className="text-center py-12 text-gray-500">
                <LayoutTemplate className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
                <p className="text-sm">{tab === 'mine' ? 'No templates yet. Create one, or duplicate a Standard template.' : 'No Standard templates yet.'}</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(t => {
                  const editable = t.scope === 'mine' || data.superAdmin;
                  return (
                    <Card key={t.id} className={'flex flex-col' + (t.hidden ? ' opacity-60' : '')}>
                      <div className="h-48 bg-[#F5F6F8] rounded-t-xl flex items-center justify-center p-4"><Thumb t={t}/></div>
                      <CardContent className="pt-4 flex-1 flex flex-col">
                        <p className="font-medium text-sm flex items-center gap-2 flex-wrap">{t.name}
                          {t.scope === 'standard' && data.superAdmin && <Badge variant={t.isPublished && t.layout ? 'success' : 'default'}>{t.isPublished && t.layout ? 'Published' : 'Hidden'}</Badge>}
                          {t.scope === 'mine' && t.offerToClients && <Badge variant="info">Offered to clients</Badge>}
                          {t.hidden && <Badge variant="default">Hidden</Badge>}
                        </p>
                        {t.layout && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {FORMAT_LABEL[t.layout.format]} {t.layout.orientation} · {new Set(t.layout.slots.map(s => s.shotIndex)).size} photo{new Set(t.layout.slots.map(s => s.shotIndex)).size === 1 ? "" : "s"}{t.alternateLayout ? ' · + ' + t.alternateLayout.orientation : ''}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                          <Link href={'/templates/' + t.id}><Button variant="ghost" size="sm">{editable ? <><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</> : <><Eye className="w-3.5 h-3.5 mr-1"/>View</>}</Button></Link>
                          {t.layout && <Button variant="ghost" size="sm" disabled={busy} onClick={() => duplicate(t)}><Copy className="w-3.5 h-3.5 mr-1"/>Duplicate</Button>}
                          {t.scope === 'standard' && t.isPublished && (
                            <Button variant="ghost" size="sm" onClick={() => setHidden(t, !t.hidden)} title={t.hidden ? 'Show in your Standard templates and to your clients' : "Hide from your event templates and your clients' design picker"}>
                              {t.hidden ? <><Eye className="w-3.5 h-3.5 mr-1"/>Show</> : <><EyeOff className="w-3.5 h-3.5 mr-1"/>Hide</>}
                            </Button>
                          )}
                          {t.scope === 'mine' && <Button variant="ghost" size="sm" className="text-[#E2445C] hover:text-[#CC3A52] hover:bg-red-50" onClick={() => setDeleting(t)}><Trash2 className="w-3.5 h-3.5 mr-1"/>Delete</Button>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Template">
        <p className="text-sm text-gray-600 mb-5">Delete <span className="font-medium text-gray-800">{deleting?.name}</span>? Events that already use it keep their copy.</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </Modal>
    </>
  );
}
