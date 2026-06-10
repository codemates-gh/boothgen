
import { cn } from '@/lib/utils';
const variants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  brand: 'bg-brand-surface text-brand-dark',
};
export function Badge({ className, variant = 'default', ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)} {...p} />;
}
