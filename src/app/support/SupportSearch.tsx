'use client';
import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { ARTICLES } from './page';

type Article = (typeof ARTICLES)[number];

interface Props {
  articles: Article[];
}

export function SupportSearch({ articles }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Article[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); setOpen(false); return; }
    const matched = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q)
    ).slice(0, 8);
    setResults(matched);
    setOpen(matched.length > 0);
  }, [query, articles]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function scrollTo(slug: string) {
    setQuery('');
    setOpen(false);
    // Use timeout to let the hash navigate + section render
    setTimeout(() => {
      const el = document.getElementById(slug);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Open the details element
        if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true;
      }
    }, 80);
    window.location.hash = slug;
  }

  function highlight(text: string, q: string) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + q.length + 80);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    const parts = snippet.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="bg-orange-200 text-orange-900 rounded px-0.5">{p}</mark>
        : p
    );
  }

  return (
    <div className="relative max-w-xl mx-auto w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search guides, features, workflows…"
          className="w-full bg-white/10 border border-white/20 text-white placeholder-purple-300 rounded-2xl pl-12 pr-10 py-4 text-base focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:bg-white/15 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-purple-300 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div ref={panelRef}
          className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 max-h-[420px] overflow-y-auto">
          <p className="px-4 py-2.5 text-xs text-gray-400 border-b border-gray-50 font-medium">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>
          {results.map(a => (
            <button key={a.id} onClick={() => scrollTo(a.slug)}
              className="w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-0 group">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5 flex-shrink-0">{a.categoryIcon}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 group-hover:text-orange-600 transition-colors leading-snug">
                    {a.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-1">{a.category}</p>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {highlight(a.content.slice(0, 300), query.trim())}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {query && !open && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-6 text-center z-50">
          <p className="text-sm text-gray-500">No results for &ldquo;{query}&rdquo; — try the AI chat below</p>
        </div>
      )}
    </div>
  );
}
