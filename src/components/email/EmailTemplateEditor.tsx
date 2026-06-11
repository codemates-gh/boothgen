'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bold, Italic, Underline, Link, Image, List,
  ChevronDown, Eye, Code, AlignLeft, AlignCenter
} from 'lucide-react';

const MERGE_TAGS = [
  { label: 'Client First Name', value: '{{client.first_name}}' },
  { label: 'Client Full Name', value: '{{client.full_name}}' },
  { label: 'Client Email', value: '{{client.email}}' },
  { label: 'Event Title', value: '{{event.title}}' },
  { label: 'Event Date', value: '{{event.date}}' },
  { label: 'Event Start Time', value: '{{event.start_time}}' },
  { label: 'Event End Time', value: '{{event.end_time}}' },
  { label: 'Venue Name', value: '{{event.venue_name}}' },
  { label: 'Venue Address', value: '{{event.venue_address}}' },
  { label: 'Venue City', value: '{{event.venue_city}}' },
  { label: 'Venue State', value: '{{event.venue_state}}' },
  { label: 'Package Name', value: '{{event.package_name}}' },
  { label: 'Guest Count', value: '{{event.guest_count}}' },
  { label: 'Invoice Total', value: '{{invoice.total}}' },
  { label: 'Invoice Balance Due', value: '{{invoice.balance_due}}' },
  { label: 'Invoice Due Date', value: '{{invoice.due_date}}' },
  { label: 'Contract Link', value: '{{contract.link}}' },
  { label: 'Portal Link', value: '{{portal.link}}' },
  { label: 'Company Name', value: '{{host.company_name}}' },
  { label: 'Company Email', value: '{{host.email}}' },
  { label: 'Company Phone', value: '{{host.phone}}' },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function EmailTemplateEditor({ value, onChange }: Props) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [showPreview, setShowPreview] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [showImgInput, setShowImgInput] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const varsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'visual' && editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [mode]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (varsRef.current && !varsRef.current.contains(e.target as Node)) {
        setShowVars(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncFromEditor();
  }

  function syncFromEditor() {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function insertVar(tag: string) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const span = document.createElement('span');
      span.className = 'merge-tag';
      span.style.cssText = 'background:#fff7ed;color:#ea6100;border:1px solid #fed7aa;border-radius:4px;padding:1px 6px;font-size:12px;font-family:monospace;cursor:default';
      span.contentEditable = 'false';
      span.setAttribute('data-tag', tag);
      span.textContent = tag;
      range.insertNode(span);
      const after = document.createTextNode('\u00A0');
      span.after(after);
      range.setStartAfter(after);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'background:#fff7ed;color:#ea6100;border:1px solid #fed7aa;border-radius:4px;padding:1px 6px;font-size:12px;font-family:monospace;cursor:default';
      span.contentEditable = 'false';
      span.setAttribute('data-tag', tag);
      span.textContent = tag;
      editorRef.current?.appendChild(span);
    }
    setShowVars(false);
    syncFromEditor();
  }

  function insertImage() {
    if (!imgUrl.trim()) return;
    const img = `<img src="${imgUrl}" alt="${imgAlt || ''}" style="max-width:100%;height:auto;display:block;margin:8px 0"/>`;
    exec('insertHTML', img);
    setImgUrl(''); setImgAlt(''); setShowImgInput(false);
  }

  function getPreviewHtml() {
    let html = value;
    MERGE_TAGS.forEach(t => {
      const ex: Record<string,string> = {
        '{{client.first_name}}': 'Jane',
        '{{client.full_name}}': 'Jane Smith',
        '{{client.email}}': 'jane@example.com',
        '{{event.title}}': 'Smith Wedding',
        '{{event.date}}': 'Saturday, July 19, 2025',
        '{{event.start_time}}': '6:00 PM',
        '{{event.end_time}}': '10:00 PM',
        '{{event.venue_name}}': 'The Grand Ballroom',
        '{{event.venue_address}}': '123 Main St',
        '{{event.venue_city}}': 'Austin',
        '{{event.venue_state}}': 'TX',
        '{{event.package_name}}': 'Deluxe 4-Hour Package',
        '{{event.guest_count}}': '150',
        '{{invoice.total}}': '$1,200.00',
        '{{invoice.balance_due}}': '$600.00',
        '{{invoice.due_date}}': 'June 1, 2025',
        '{{contract.link}}': '#',
        '{{portal.link}}': '#',
        '{{host.company_name}}': 'Your Photo Booth Co.',
        '{{host.email}}': 'hello@yourbusiness.com',
        '{{host.phone}}': '(555) 123-4567',
      };
      html = html.replaceAll(t.value, `<strong style="color:#ea6100">${ex[t.value] ?? t.value}</strong>`);
    });
    return html;
  }

  const TB = ({ title, onClick, children }: any) => (
    <button type="button" title={title} onClick={onClick}
      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
      {children}
    </button>
  );

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
        <TB title="Bold" onClick={() => exec('bold')}><Bold className="w-4 h-4"/></TB>
        <TB title="Italic" onClick={() => exec('italic')}><Italic className="w-4 h-4"/></TB>
        <TB title="Underline" onClick={() => exec('underline')}><Underline className="w-4 h-4"/></TB>
        <div className="w-px h-5 bg-gray-300 mx-1"/>
        <TB title="Align Left" onClick={() => exec('justifyLeft')}><AlignLeft className="w-4 h-4"/></TB>
        <TB title="Align Center" onClick={() => exec('justifyCenter')}><AlignCenter className="w-4 h-4"/></TB>
        <div className="w-px h-5 bg-gray-300 mx-1"/>
        <TB title="Bullet List" onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4"/></TB>
        <TB title="Insert Link" onClick={() => {
          const url = prompt('Enter URL:');
          if (url) exec('createLink', url);
        }}><Link className="w-4 h-4"/></TB>
        <TB title="Insert Image" onClick={() => setShowImgInput(!showImgInput)}><Image className="w-4 h-4"/></TB>
        <div className="w-px h-5 bg-gray-300 mx-1"/>

        {/* Variables dropdown */}
        <div className="relative" ref={varsRef}>
          <button type="button" onClick={() => setShowVars(!showVars)}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-surface text-brand border border-brand/30 rounded-lg text-xs font-semibold hover:bg-brand/10 transition-colors">
            Insert Variable <ChevronDown className="w-3 h-3"/>
          </button>
          {showVars && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
              {MERGE_TAGS.map(t => (
                <button key={t.value} type="button" onClick={() => insertVar(t.value)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                  <p className="font-medium text-gray-700">{t.label}</p>
                  <p className="text-xs font-mono text-brand">{t.value}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => { setMode(m => m === 'visual' ? 'html' : 'visual'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
            <Code className="w-3 h-3"/>{mode === 'visual' ? 'HTML' : 'Visual'}
          </button>
          <button type="button" onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
            <Eye className="w-3 h-3"/>Preview
          </button>
        </div>
      </div>

      {/* Image insert panel */}
      {showImgInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
          <Input className="h-8 text-sm" placeholder="Image URL" value={imgUrl} onChange={e => setImgUrl(e.target.value)}/>
          <Input className="h-8 text-sm w-40" placeholder="Alt text" value={imgAlt} onChange={e => setImgAlt(e.target.value)}/>
          <Button size="sm" onClick={insertImage} disabled={!imgUrl.trim()}>Insert</Button>
          <Button size="sm" variant="outline" onClick={() => { setShowImgInput(false); setImgUrl(''); setImgAlt(''); }}>Cancel</Button>
        </div>
      )}

      {/* Editor / HTML / Preview */}
      {showPreview ? (
        <div className="p-6 min-h-48 bg-white prose max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}/>
      ) : mode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncFromEditor}
          className="min-h-48 p-4 text-sm focus:outline-none"
          style={{ lineHeight: 1.7 }}
          data-placeholder="Start writing your email..."
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full min-h-48 p-4 font-mono text-xs focus:outline-none resize-none"
          placeholder="<p>Hi {{client.first_name}},</p>"
        />
      )}

      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
        <span>Click "Insert Variable" to add merge tags</span>
        <span>Preview shows sample data</span>
      </div>
    </div>
  );
}
