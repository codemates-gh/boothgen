import { TopBar } from '@/components/layout/TopBar';
import GuestMessagingSettings from '@/components/messaging/GuestMessagingSettings';

// Genie → Guest Sharing: how guests get their photos by text and email (also in Settings → Email & Texting)
export default function GenieSharingPage() {
  return (
    <>
      <TopBar title="Guest Sharing" />
      <div className="p-4 sm:p-8 max-w-3xl">
        <GuestMessagingSettings />
      </div>
    </>
  );
}
