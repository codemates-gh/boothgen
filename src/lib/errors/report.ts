// Send a browser-side error to the server logs (Vercel → Runtime errors, as "[client-error]"), so failures that only
// happen in someone's browser can be diagnosed. Best effort: never throws.
export function reportClientError(error: Error & { digest?: string }, where: string) {
  try {
    const body = JSON.stringify({
      where, message: String(error?.message ?? error).slice(0, 1000), stack: String(error?.stack ?? '').slice(0, 4000),
      digest: error?.digest ?? null, url: typeof location !== 'undefined' ? location.pathname + location.search : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    else fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}
