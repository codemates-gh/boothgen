import type { BoomerangSettings } from './schemas';
import type { RemoteAsset } from './templateAssets';

// Stored on EventGenieSettings.boomerang: the bundle's BoomerangConfig plus the overlay's pixel size (not sent to iPads)
export type StoredBoomerang = BoomerangSettings & { overlay?: RemoteAsset; overlaySize?: { width: number; height: number } };

export function storedBoomerang(v: unknown): StoredBoomerang | null {
  return v && typeof v === 'object' ? v as StoredBoomerang : null;
}

// BoomerangConfig as the bundle sends it
export function bundleBoomerang(v: unknown) {
  const b = storedBoomerang(v);
  if (!b) return undefined;
  const { overlaySize: _s, overlay, ...rest } = b;
  return { ...rest, ...(overlay ? { overlay } : {}) };
}

