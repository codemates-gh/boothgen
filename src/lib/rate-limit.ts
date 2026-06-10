
const windows = new Map<string, number[]>();
export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now(); const cutoff = now - windowMs;
  const hits = (windows.get(key) ?? []).filter(t => t > cutoff);
  if (hits.length >= limit) return { success: false };
  hits.push(now); windows.set(key, hits);
  if (windows.size > 5000) for (const [k, v] of windows) { if (v.every(t => t <= cutoff)) windows.delete(k); }
  return { success: true };
}
export const checkLeadRateLimit = (ip: string) => checkRateLimit('lead:' + ip, 5, 600000);
export const checkSigningRateLimit = (ip: string) => checkRateLimit('sign:' + ip, 10, 600000);
