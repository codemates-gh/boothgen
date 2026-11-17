// Super Admin → Storage: gallery storage per operator, largest first, with accounts over the review line flagged.
// Server component (the Super Admin page is already restricted to super admins).
import { prisma } from '@/lib/prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes, GB, getUploadLimits } from '@/lib/gallery/uploadRules';

// Review line: an account storing more than this is worth a look (about 25 busy events at once)
const REVIEW_BYTES = 50 * GB;

type Row = { tenantId: string; name: string; galleries: number; files: number; bytes: number; largest: number };

export default async function StorageUsage() {
  const rows = await prisma.$queryRaw<{ tenantId: string; name: string; galleries: bigint; files: bigint; bytes: bigint | null; largest: bigint | null }[]>`
    SELECT t.id AS "tenantId", t.name,
           COUNT(DISTINCT g.id) AS galleries,
           COUNT(a.id) AS files,
           SUM(a."fileSizeBytes") AS bytes,
           MAX(per.bytes) AS largest
    FROM tenants t
    JOIN galleries g ON g."tenantId" = t.id
    JOIN gallery_assets a ON a."galleryId" = g.id
    LEFT JOIN (SELECT "galleryId", SUM("fileSizeBytes") AS bytes FROM gallery_assets GROUP BY "galleryId") per ON per."galleryId" = g.id
    GROUP BY t.id, t.name
    ORDER BY bytes DESC NULLS LAST
    LIMIT 200`;
  const limits = await getUploadLimits();
  const data: Row[] = rows.map(r => ({ tenantId: r.tenantId, name: r.name, galleries: Number(r.galleries), files: Number(r.files), bytes: Number(r.bytes ?? 0), largest: Number(r.largest ?? 0) }));
  const total = data.reduce((n, r) => n + r.bytes, 0);
  const files = data.reduce((n, r) => n + r.files, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-gray-400 uppercase">Total stored</p><p className="text-2xl font-bold">{formatBytes(total)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-gray-400 uppercase">Files</p><p className="text-2xl font-bold">{files.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-gray-400 uppercase">Accounts with photos</p><p className="text-2xl font-bold">{data.length}</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-0">
        {data.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No gallery photos stored yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase">
              <th className="text-left px-6 py-3">Operator</th><th className="text-right px-6 py-3">Galleries</th><th className="text-right px-6 py-3">Files</th><th className="text-right px-6 py-3">Stored</th><th className="text-right px-6 py-3">Largest gallery</th><th className="px-6 py-3"></th>
            </tr></thead>
            <tbody>
              {data.map(r => (
                <tr key={r.tenantId} className="border-b last:border-0">
                  <td className="px-6 py-3 font-medium">{r.name}</td>
                  <td className="px-6 py-3 text-right">{r.galleries}</td>
                  <td className="px-6 py-3 text-right">{r.files.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right font-medium">{formatBytes(r.bytes)}</td>
                  <td className="px-6 py-3 text-right text-gray-500">{formatBytes(r.largest)}</td>
                  <td className="px-6 py-3 text-right">
                    {r.bytes > REVIEW_BYTES ? <Badge variant="warning">Over {formatBytes(REVIEW_BYTES)}</Badge>
                      : r.largest >= limits.galleryMaxGb * GB * 0.9 ? <Badge variant="warning">Gallery near {limits.galleryMaxGb} GB</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
      <p className="text-xs text-gray-400">Sizes are what each upload reported. Galleries are hidden and then deleted on the schedule in Settings, so these numbers go down on their own.</p>
    </div>
  );
}
