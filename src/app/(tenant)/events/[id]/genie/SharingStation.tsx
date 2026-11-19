'use client';
import { Input } from '@/components/ui/input';
import { Field, Toggle } from '@/components/genie/parts';

export type SharingStationValue = { recentMinutes: number | null; blurGrid: boolean };

// Event → Genie → Sharing → Sharing station (PC booth): any Genie iPad can be a Sharing station for PC booth software
// (DSLR Remote Pro or anything that saves to a folder). The Genie print box on the PC watches the folder and sends each
// new photo to the iPad. Part of every Genie event; these options are this event's only.
export function SharingStationFields({ value, disabled, onChange }: {
  value: SharingStationValue; disabled?: boolean; onChange: (v: Partial<SharingStationValue>) => void;
}) {
  const recent = value.recentMinutes !== null;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Sharing station (PC booth)</p>
        <p className="text-xs text-gray-500 mt-0.5">Any iPad at this event can share photos made by PC booth software: guests find theirs and get it by text, email or QR. It uses one of the event's iPad spots, with one PC per event. Included with the event. These options are for this event only.</p>
      </div>
      <Toggle checked={recent} disabled={disabled} onChange={v => onChange({ recentMinutes: v ? 15 : null })} label="Show only recent photos"
        hint="Off: every photo of the event stays on the iPad's grid. On: guests only see photos from the last few minutes."/>
      {recent && (
        <div className="max-w-xs">
          <Field label="Recent means the last (minutes)" hint="5 to 60">
            <Input type="number" min={5} max={60} value={value.recentMinutes ?? 15} disabled={disabled}
              onChange={e => onChange({ recentMinutes: Math.max(5, Math.min(60, Number(e.target.value) || 15)) })}/>
          </Field>
        </div>
      )}
      <Toggle checked={value.blurGrid} disabled={disabled} onChange={v => onChange({ blurGrid: v })} label="Blur photos until tapped"
        hint="For privacy: guests tap a photo to see it."/>
    </div>
  );
}
