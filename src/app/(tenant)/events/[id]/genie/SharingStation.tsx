'use client';
import { Input } from '@/components/ui/input';
import { Field, Toggle } from '@/components/genie/parts';
import { fmtCents } from '@/lib/utils';
import { SHARING_MAX_PCS } from '@/lib/genie/sharingStation';

export type SharingStationValue = { enabled: boolean; pcs: number; recentMinutes: number | null; blurGrid: boolean; uploadAll: boolean };

// Event → Genie → Sharing station (PC booth): an iPad that shares photos made by PC booth software (DSLR Remote Pro or
// anything that saves to a folder). The Genie print box on the PC watches the folder and sends each new photo to the iPad.
export function SharingStationFields({ value, disabled, pcPriceCents, pcsPaid, onChange }: {
  value: SharingStationValue; disabled?: boolean; pcPriceCents: number; pcsPaid: number; onChange: (v: Partial<SharingStationValue>) => void;
}) {
  const recent = value.recentMinutes !== null;
  return (
    <div className="space-y-4">
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Use a Sharing station at this event"
        hint={`Guests find their photo from the PC booth on the iPad and get it by text, email or QR. ${fmtCents(pcPriceCents)} per PC for this event, paid with the event; until it's paid, shared photos show a watermark. The iPad uses one of the event's iPad spots.`}/>
      {value.enabled && (
        <>
          {SHARING_MAX_PCS > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="PCs running booth software" hint={pcsPaid ? `${pcsPaid} paid` : 'One Genie print box on each PC'}>
                <Input type="number" min={1} max={SHARING_MAX_PCS} value={value.pcs} disabled={disabled}
                  onChange={e => onChange({ pcs: Math.max(1, Math.min(SHARING_MAX_PCS, Number(e.target.value) || 1)) })}/>
              </Field>
            </div>
          )}
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
          <Toggle checked={value.uploadAll} disabled={disabled} onChange={v => onChange({ uploadAll: v })} label="Upload every photo to the gallery"
            hint="Off: only photos guests share are uploaded. On: every photo from the PC goes to the event's gallery (uses more storage)."/>
        </>
      )}
    </div>
  );
}
