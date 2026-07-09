
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
const variants: Record<string, string> = {
  default:     'bg-[#0085FF] text-white hover:bg-[#0073E6]',
  outline:     'border border-gray-200 bg-white text-[#1F1F3D] hover:bg-[#F5F6F8]',
  ghost:       'text-[#676879] hover:bg-[#F5F6F8] hover:text-[#1F1F3D]',
  destructive: 'bg-[#E2445C] text-white hover:bg-[#CC3A52]',
  secondary:   'bg-[#F5F6F8] text-[#1F1F3D] hover:bg-gray-200',
};
const sizes: Record<string, string> = { default: 'h-9 px-4 py-2 text-sm', sm: 'h-7 px-3 text-xs', lg: 'h-11 px-8 text-base', icon: 'h-9 w-9' };
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: keyof typeof variants; size?: keyof typeof sizes; }
const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'default', size = 'default', ...props }, ref) => (
  <button ref={ref} className={cn('inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0085FF] disabled:opacity-50 disabled:pointer-events-none', variants[variant], sizes[size], className)} {...props} />
));
Button.displayName = 'Button';
export { Button };
