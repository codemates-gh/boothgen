'use client';
import { useEffect, useRef, useState } from 'react';
import { CloudUpload, WifiOff } from 'lucide-react';
import { pollDelayMs } from '@/lib/genie/guestWaiting';

// Re-checks while `active`: every 5 s for 2 min, then 15 s, then 60 s after 10 min (pollDelayMs). The schedule
// restarts when `resetKey` changes (new photos arrived), pauses while the tab is hidden and checks at once when
// it's shown again.
export function useWaitingPoll(load: () => Promise<unknown> | void, active: boolean, resetKey?: unknown) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const startedAt = useRef<number | null>(null);

  useEffect(() => { startedAt.current = active ? Date.now() : null; }, [resetKey, active]);

  useEffect(() => {
    if (!active) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      timer = setTimeout(async () => { await loadRef.current(); schedule(); }, pollDelayMs(Date.now() - (startedAt.current ?? Date.now())));
    };
    const onVisibility = async () => {
      clearTimeout(timer);
      if (document.hidden) return;
      await loadRef.current();
      schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [active]);
}

// How long this page has been waiting (for the muted "ask the host" line)
export function useWaitingFor(active: boolean): number {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now - since;
}

export function UploadingIndicator({ color }: { color: string }) {
  return (
    <div className="mx-auto mb-6 w-24">
      <div className="relative w-20 h-20 mx-auto">
        <span className="absolute inset-0 rounded-full animate-ping opacity-15" style={{ backgroundColor: color }}/>
        <div className="relative w-20 h-20 rounded-full bg-white shadow-card flex items-center justify-center">
          <CloudUpload className="w-9 h-9 animate-upload-lift" style={{ color }}/>
        </div>
      </div>
      <div className="mt-5 h-1 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full w-1/3 rounded-full animate-upload-slide" style={{ backgroundColor: color }}/>
      </div>
    </div>
  );
}

export function BoothOffline() {
  return (
    <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-white shadow-card flex items-center justify-center">
      <WifiOff className="w-8 h-8 text-gray-400"/>
    </div>
  );
}

// Photo that fades in once it has loaded
export function FadeInImg({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return <img {...props} onLoad={() => setLoaded(true)} className={(className ?? '') + ' transition-opacity duration-700 ' + (loaded ? 'opacity-100' : 'opacity-0')}/>;
}
