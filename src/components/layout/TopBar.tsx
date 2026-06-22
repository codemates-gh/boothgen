import { NotificationBell } from './NotificationBell';

export function TopBar({ title }: { title: string }) {
  return (
    <header className="h-14 lg:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 fixed right-0 left-0 lg:left-64 top-0 z-30">
      <h1 className="text-base lg:text-xl font-semibold text-gray-900 pl-10 lg:pl-0 truncate">{title}</h1>
      <NotificationBell />
    </header>
  );
}
