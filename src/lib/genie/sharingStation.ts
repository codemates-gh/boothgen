import { z } from 'zod';
import type { EventGenieSettings } from '@prisma/client';

// Sharing station for PC booth software (Genie P12): an iPad that shares photos made by PC booth software (the print
// box watches the PC's folder). Part of every Genie event since 2.113.0: no switch and no extra price (the event's own
// payment covers it); only the three guest-grid/upload options are per event. Wire shape: SharingStationConfig.json in
// the Genie repo. sharingStationEnabled / sharingStationPcs (event) and Tenant.sharingStationOff are no longer used.

// Release A: one PC per event, with up to 2 iPads (the event's Genie iPad spots). Two PCs per iPad is Release B.

export const SharingStationPatch = z.object({
  // "Show only recent photos": null = every photo of the event stays on the guest grid
  recentMinutes: z.number().int().min(5, 'Recent photos: 5 to 60 minutes').max(60, 'Recent photos: 5 to 60 minutes').nullable(),
  blurGrid: z.boolean(),
  uploadAll: z.boolean(),
}).strict();
export type SharingStationPatch = z.infer<typeof SharingStationPatch>;

export function sharingStationData(p: SharingStationPatch) {
  return {
    sharingRecentMinutes: p.recentMinutes, sharingBlurGrid: p.blurGrid, sharingUploadAll: p.uploadAll,
  };
}

type Stored = Pick<EventGenieSettings, 'sharingRecentMinutes' | 'sharingBlurGrid' | 'sharingUploadAll'>;

export function sharingStationView(s: Stored) {
  return { recentMinutes: s.sharingRecentMinutes, blurGrid: s.sharingBlurGrid, uploadAll: s.sharingUploadAll };
}

// EventBundle.sharingStation: always sent for Genie events; defaults (false / every photo) left out
export function bundleSharingStation(s: Stored) {
  return {
    enabled: true,
    ...(s.sharingRecentMinutes ? { recentMinutes: Math.min(60, Math.max(5, s.sharingRecentMinutes)) } : {}),
    ...(s.sharingBlurGrid ? { blurGrid: true } : {}),
    ...(s.sharingUploadAll ? { uploadAll: true } : {}),
  };
}
