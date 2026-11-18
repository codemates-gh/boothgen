import type { BoomerangFormat, BoomerangSettings } from './schemas';
import type { RemoteAsset } from './templateAssets';
import { resolveDesign, type DesignChoice } from './clipDesigns';

// Stored on EventGenieSettings.boomerang: the bundle's BoomerangConfig plus the overlay's pixel size and the chosen
// design (sent resolved as a ClipDesign); neither extra is sent as stored
export type StoredBoomerang = BoomerangSettings & { overlay?: RemoteAsset; overlaySize?: { width: number; height: number }; design?: DesignChoice };

export function storedBoomerang(v: unknown): StoredBoomerang | null {
  return v && typeof v === 'object' ? v as StoredBoomerang : null;
}

// The event's design as the bundle sends it: left out when none is chosen, it was deleted, or its shape no longer
// matches the Boomerang's format
export async function boomerangDesign(v: unknown, tenantId: string) {
  const b = storedBoomerang(v);
  if (!b?.design) return undefined;
  const r = await resolveDesign(b.design, tenantId, b.format);
  return 'design' in r ? r.design : undefined;
}

// Why the chosen design isn't sent (shown as a notice in the editor), or null
export async function boomerangDesignProblem(v: unknown, tenantId: string): Promise<'deleted' | 'shape' | null> {
  const b = storedBoomerang(v);
  if (!b?.design) return null;
  const r = await resolveDesign(b.design, tenantId, b.format as BoomerangFormat);
  return 'problem' in r ? r.problem : null;
}

// BoomerangConfig as the bundle sends it; edgeLight comes from the Capture section (account default / event override)
export function bundleBoomerang(v: unknown, edgeLight: boolean, design?: Awaited<ReturnType<typeof boomerangDesign>>) {
  const b = storedBoomerang(v);
  if (!b) return undefined;
  const { overlaySize: _s, overlay, design: _d, ...rest } = b;
  return { ...rest, edgeLight, ...(overlay ? { overlay } : {}), ...(design ? { design } : {}) };
}
