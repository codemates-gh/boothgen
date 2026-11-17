'use client';
import { Button as HeroButton } from '@heroui/react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
type Size    = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// HeroUI v3 variant names (v3 has no `color` prop and no "bordered"/"solid"/"flat")
const heroVariant: Record<Variant, 'primary' | 'outline' | 'ghost' | 'danger' | 'secondary'> = {
  default:     'primary',
  outline:     'outline',
  ghost:       'ghost',
  destructive: 'danger',
  secondary:   'secondary',
};

// BoothGen's own look, on top of HeroUI (Tailwind utilities win over HeroUI's component styles)
const variantClass: Record<Variant, string> = {
  default:     'bg-[#0085FF] text-white hover:bg-[#0073E6]',
  outline:     'border border-gray-200 bg-white text-[#1F1F3D] hover:bg-[#F5F6F8]',
  ghost:       'bg-transparent text-[#676879] hover:bg-[#F5F6F8] hover:text-[#1F1F3D]',
  destructive: 'bg-[#E2445C] text-white hover:bg-[#CC3A52]',
  secondary:   'bg-[#F5F6F8] text-[#1F1F3D] hover:bg-gray-200',
};
const sizeClass: Record<Size, string> = {
  default: 'h-9 px-4 py-2 text-sm',
  sm:      'h-7 px-3 text-xs',
  lg:      'h-11 px-8 text-base',
  icon:    'h-9 w-9 min-w-9 p-0',
};
const heroSize: Record<Size, 'sm' | 'md' | 'lg'> = { default: 'md', sm: 'sm', lg: 'lg', icon: 'md' };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', disabled, ...props }, ref) => (
    <HeroButton
      ref={ref}
      variant={heroVariant[variant]}
      size={heroSize[size]}
      isIconOnly={size === 'icon' || undefined}
      isDisabled={disabled}
      className={cn(
        'rounded-lg font-semibold gap-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0085FF] disabled:opacity-50',
        variantClass[variant], sizeClass[size], className,
      )}
      {...(props as any)}
    />
  )
);
Button.displayName = 'Button';
export { Button };
