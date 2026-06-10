
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
const variants: Record<string, string> = {
  default: 'bg-brand text-white hover:bg-brand-dark',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
};
const sizes: Record<string, string> = { default: 'h-10 px-4 py-2', sm: 'h-8 px-3 text-sm', lg: 'h-11 px-8', icon: 'h-10 w-10' };
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: keyof typeof variants; size?: keyof typeof sizes; }
const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'default', size = 'default', ...props }, ref) => (
  <button ref={ref} className={cn('inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none', variants[variant], sizes[size], className)} {...props} />
));
Button.displayName = 'Button';
export { Button };
