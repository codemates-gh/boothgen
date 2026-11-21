// iPad hardware identifiers ("iPad13,17", from Genie's DeviceIdentity.model) to the names people know. Safe to import
// in the browser. iPadOS only tells apps a device's name is "iPad" (the real one needs an Apple entitlement), so a
// device still called that is shown by its model until the operator names it (Genie → Devices, or on the event).

const MODELS: [string[], string][] = [
  [['iPad6,11', 'iPad6,12'], 'iPad (5th generation)'],
  [['iPad7,5', 'iPad7,6'], 'iPad (6th generation)'],
  [['iPad7,11', 'iPad7,12'], 'iPad (7th generation)'],
  [['iPad11,6', 'iPad11,7'], 'iPad (8th generation)'],
  [['iPad12,1', 'iPad12,2'], 'iPad (9th generation)'],
  [['iPad13,18', 'iPad13,19'], 'iPad (10th generation)'],
  [['iPad15,7', 'iPad15,8'], 'iPad (A16)'],
  [['iPad11,3', 'iPad11,4'], 'iPad Air (3rd generation)'],
  [['iPad13,1', 'iPad13,2'], 'iPad Air (4th generation)'],
  [['iPad13,16', 'iPad13,17'], 'iPad Air (5th generation)'],
  [['iPad14,8', 'iPad14,9'], 'iPad Air 11-inch (M2)'],
  [['iPad14,10', 'iPad14,11'], 'iPad Air 13-inch (M2)'],
  [['iPad15,3', 'iPad15,4'], 'iPad Air 11-inch (M3)'],
  [['iPad15,5', 'iPad15,6'], 'iPad Air 13-inch (M3)'],
  [['iPad11,1', 'iPad11,2'], 'iPad mini (5th generation)'],
  [['iPad14,1', 'iPad14,2'], 'iPad mini (6th generation)'],
  [['iPad16,1', 'iPad16,2'], 'iPad mini (A17 Pro)'],
  [['iPad7,1', 'iPad7,2'], 'iPad Pro 12.9-inch (2nd generation)'],
  [['iPad7,3', 'iPad7,4'], 'iPad Pro 10.5-inch'],
  [['iPad8,1', 'iPad8,2', 'iPad8,3', 'iPad8,4'], 'iPad Pro 11-inch (1st generation)'],
  [['iPad8,5', 'iPad8,6', 'iPad8,7', 'iPad8,8'], 'iPad Pro 12.9-inch (3rd generation)'],
  [['iPad8,9', 'iPad8,10'], 'iPad Pro 11-inch (2nd generation)'],
  [['iPad8,11', 'iPad8,12'], 'iPad Pro 12.9-inch (4th generation)'],
  [['iPad13,4', 'iPad13,5', 'iPad13,6', 'iPad13,7'], 'iPad Pro 11-inch (3rd generation)'],
  [['iPad13,8', 'iPad13,9', 'iPad13,10', 'iPad13,11'], 'iPad Pro 12.9-inch (5th generation)'],
  [['iPad14,3', 'iPad14,4'], 'iPad Pro 11-inch (4th generation)'],
  [['iPad14,5', 'iPad14,6'], 'iPad Pro 12.9-inch (6th generation)'],
  [['iPad16,3', 'iPad16,4'], 'iPad Pro 11-inch (M4)'],
  [['iPad16,5', 'iPad16,6'], 'iPad Pro 13-inch (M4)'],
];
const BY_ID = new Map(MODELS.flatMap(([ids, name]) => ids.map(id => [id, name] as const)));

// "iPad Air (5th generation)" for "iPad13,17"; the identifier itself when it isn't in the list (a newer iPad)
export function ipadModelName(model: string | null | undefined): string | null {
  if (!model) return null;
  return BY_ID.get(model) ?? model;
}

// iPadOS's stand-in name: the device was never named
export const isGenericName = (name: string | null | undefined) => !name?.trim() || name.trim().toLowerCase() === 'ipad';

// What to call the device: its own name, else its model
export function deviceLabel(d: { name: string; model: string | null }): string {
  return isGenericName(d.name) ? ipadModelName(d.model) ?? 'iPad' : d.name;
}

// The line under it: the model (when the name isn't already it), the app version and when it was last seen
export function deviceDetails(d: { name: string; model: string | null; appVersion: string | null }): string[] {
  const model = isGenericName(d.name) ? null : ipadModelName(d.model);
  return [model, d.appVersion && 'v' + d.appVersion].filter((x): x is string => !!x);
}
