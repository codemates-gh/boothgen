'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, User, Calendar, Receipt, FileText } from 'lucide-react';

type Result = {
  type: 'client' | 'event' | 'invoice' | 'contract';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
};

const typeIcon: Record<string, React.ElementType> = {
  client: User,
  event: Calendar,
  invoice: Receipt,
  contract: FileText,
};

const typeLabel: Record<string, string> = {
  client: 'Client',
  event: 'Event',
  invoice: 'Invoice',
  contract: 'Contract',
};

const typeColor: Record<string, string> = {
  client: 'bg-blue-100 text-blue-600',
  event: 'bg-green-100 text-green-600',
  invoice: 'bg-emerald-100 text-emerald-600',
  contract: 'bg-purple-100 text-purple-600',
};

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setActiveIdx(0);
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await fetch('/api/search?q=' + encodeURIComponent(query));
      if (res.ok) setResults(await res.json());
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { navigate(results[activeIdx].href); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search clients, events, invoices, contracts…"
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          {loading && <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => {
              const Icon = typeIcon[r.type];
              return (
                <li key={r.type + r.id}>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                    onClick={() => navigate(r.href)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColor[r.type]}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                      <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{typeLabel[r.type]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No results for "{query}"</div>
        )}

        {query.length < 2 && (
          <div className="px-4 py-3 text-xs text-gray-400 flex items-center justify-between">
            <span>Type to search across clients, events, invoices & contracts</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">ESC</kbd>
          </div>
        )}
      </div>
    </div>
  );
}
