
import { cn } from '@/lib/utils';
const variants: Record<string, string> = {
  default:  'bg-[#676879] text-white',
  success:  'bg-[#00C875] text-white',
  warning:  'bg-[#FDAB3D] text-white',
  danger:   'bg-[#E2445C] text-white',
  info:     'bg-[#0085FF] text-white',
  brand:    'bg-[#F97316] text-white',
};
export function Badge({ className, variant = 'default', ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide', variants[variant], className)} {...p} />;
}
