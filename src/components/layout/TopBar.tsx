import { Bell } from 'lucide-react';
export function TopBar({ title }: { title: string }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 fixed right-0 left-64 top-0 z-30">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <button className="text-gray-400 hover:text-gray-600"><Bell className="w-5 h-5" /></button>
    </header>
  );
}
