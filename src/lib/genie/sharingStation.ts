import { z } from 'zod';
import type { EventGenieSettings } from '@prisma/client';

// Sharing station for PC booth software (Genie P12): an iPad that shares photos made by PC booth software (the print
// box watches the PC's folder). A paid add-on per event ($12 per PC, src/lib/genie/payments.ts); Super Admin can switch
// it off for an account (Tenant.sharingStationOff). Wire shape: SharingStationConfig.json in the Genie repo.

// Release A: one PC (with up to 2 iPads, the event's Genie iPad spots). Raise for Release B.
export const SHARING_MAX_PCS = 1;

// PCs billed for an event's Sharing station: at least 1, at most SHARING_MAX_PCS (older rows may hold more)
export function sharingPcsBilled(stored: number) {
  return Math.min(SHARING_MAX_PCS, Math.max(1, stored));
}

export const SharingStationPatch = z.object({
  enabled: z.boolean(),
  pcs: z.number().int().min(1).max(SHARING_MAX_PCS),
  // "Show only recent photos": null = every photo of the event stays on the guest grid
  recentMinutes: z.number().int().min(5, 'Recent photos: 5 to 60 minutes').max(60, 'Recent photos: 5 to 60 minutes').nullable(),
  blurGrid: z.boolean(),
  uploadAll: z.boolean(),
}).strict();
export type SharingStationPatch = z.infer<typeof SharingStationPatch>;

export function sharingStationData(p: SharingStationPatch) {
  return {
    sharingStationEnabled: p.enabled, sharingStationPcs: p.pcs, sharingRecentMinutes: p.recentMinutes,
    sharingBlurGrid: p.blurGrid, sharingUploadAll: p.uploadAll,
  };
}

type Stored = Pick<EventGenieSettings, 'sharingStationEnabled' | 'sharingStationPcs' | 'sharingRecentMinutes' | 'sharingBlurGrid' | 'sharingUploadAll'>;

export function sharingStationView(s: Stored) {
  return { enabled: s.sharingStationEnabled, pcs: sharingPcsBilled(s.sharingStationPcs), recentMinutes: s.sharingRecentMinutes, blurGrid: s.sharingBlurGrid, uploadAll: s.sharingUploadAll };
}

// EventBundle.sharingStation: absent when off (or the account can't use it); defaults (false / every photo) left out
export function bundleSharingStation(s: Stored, allowed: boolean) {
  if (!allowed || !s.sharingStationEnabled) return undefined;
  return {
    enabled: true,
    ...(s.sharingRecentMinutes ? { recentMinutes: Math.min(60, Math.max(5, s.sharingRecentMinutes)) } : {}),
    ...(s.sharingBlurGrid ? { blurGrid: true } : {}),
    ...(s.sharingUploadAll ? { uploadAll: true } : {}),
  };
}
