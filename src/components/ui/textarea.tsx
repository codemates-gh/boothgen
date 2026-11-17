
'use client';
import { TextArea as HeroTextArea } from '@heroui/react';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <HeroTextArea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
        'placeholder:text-gray-400',
        'focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent',
        'disabled:opacity-50 resize-none',
        className
      )}
      {...(props as any)}
    />
  )
);
Textarea.displayName = 'Textarea';
export { Textarea };
