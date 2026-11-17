
import { cn } from '@/lib/utils';
import { SelectHTMLAttributes, forwardRef } from 'react';

/* HeroUI's Select is a full headless component and not a drop-in for <select>.
   We keep a styled native <select> here so the rest of the app works unchanged,
   while getting the same visual treatment as HeroUI inputs. */
const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Select.displayName = 'Select';
export { Select };
