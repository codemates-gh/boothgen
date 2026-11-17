
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

const variantMap: Record<Variant, { color: 'primary' | 'danger' | 'default'; variant: 'solid' | 'bordered' | 'ghost' | 'flat' }> = {
  default:     { color: 'primary', variant: 'solid'   },
  outline:     { color: 'default', variant: 'bordered' },
  ghost:       { color: 'default', variant: 'ghost'    },
  destructive: { color: 'danger',  variant: 'solid'    },
  secondary:   { color: 'default', variant: 'flat'     },
};

const sizeMap: Record<Size, 'sm' | 'md' | 'lg'> = {
  default: 'md',
  sm:      'sm',
  lg:      'lg',
  icon:    'md',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', disabled, ...props }, ref) => {
    const { color, variant: heroVariant } = variantMap[variant];
    return (
      <HeroButton
        ref={ref}
        color={color}
        variant={heroVariant}
        size={sizeMap[size]}
        isDisabled={disabled}
        className={cn(size === 'icon' ? 'min-w-9 w-9 h-9 p-0' : '', className)}
        {...(props as any)}
      />
    );
  }
);
Button.displayName = 'Button';
export { Button };
