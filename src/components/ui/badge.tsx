
import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const colorMap: Record<BadgeVariant, 'default' | 'success' | 'warning' | 'danger' | 'primary' | 'secondary'> = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  danger:  'danger',
  info:    'primary',
  brand:   'secondary',
};

const customColors: Partial<Record<BadgeVariant, string>> = {
  brand: 'bg-[#F97316] text-white',
};

export function Badge({
  className,
  variant = 'default',
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <Chip
      color={colorMap[variant]}
      size="sm"
      radius="sm"
      className={cn(
        'text-[11px] font-semibold tracking-wide px-2 py-0.5',
        customColors[variant],
        className
      )}
      {...(p as any)}
    />
  );
}
