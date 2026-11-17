// Settings: the grouped Settings menu beside every settings page (each page keeps its own TopBar and content)
import SettingsNav from './SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex">
      <SettingsNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
