'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Camera, Layers, Upload, Clock, FileText,
  Inbox, CheckCircle, X, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle, Camera, Layers, Upload, Clock, FileText, Inbox, CheckCircle,
};

export interface DismissRow {
  id: string;
  iconName: string;
  iconCls: string;
  rowCls: string;
  title: string;
  detail: string;
  href: string;
}

interface Props {
  items: DismissRow[];
  storagePrefix: string;
  title: string;
  titleIconName: string;
  titleIconCls: string;
  subtitle?: string;
  emptyNode?: React.ReactNode;
}

export default function DismissableSection({
  items, storagePrefix, title, titleIconName, titleIconCls, subtitle, emptyNode,
}: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(storagePrefix))
      .map(k => k.slice(storagePrefix.length));
    setDismissed(new Set(keys));
    setMounted(true);
  }, [storagePrefix]);

  function dismiss(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem(storagePrefix + id, '1');
    setDismissed(prev => new Set([...prev, id]));
  }

  const visible = mounted ? items.filter(i => !dismissed.has(i.id)) : items;

  if (mounted && visible.length === 0) return <>{emptyNode ?? null}</>;

  const TitleIcon = ICON_MAP[titleIconName] ?? AlertTriangle;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TitleIcon className={`w-4 h-4 ${titleIconCls}`} />
          {title}
          <span className="ml-auto text-xs font-normal text-gray-400">
            {visible.length} item{visible.length !== 1 ? 's' : ''}
            {subtitle ? ` · ${subtitle}` : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {visible.map((item, i) => {
          const Icon = ICON_MAP[item.iconName] ?? AlertTriangle;
          return (
            <Link key={item.id} href={item.href}>
              <div className={`group flex items-center gap-4 px-6 py-3.5 hover:brightness-95 transition-all cursor-pointer ${item.rowCls} ${i < visible.length - 1 ? 'border-b border-white/60' : ''}`}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${item.iconCls}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.detail}</p>
                </div>
                <button
                  onClick={e => dismiss(item.id, e)}
                  className="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-black/5 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
