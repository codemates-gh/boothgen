
import { Card as HeroCard, CardHeader as HeroCardHeader, CardContent as HeroCardContent, CardFooter } from '@heroui/react';
import { cn } from '@/lib/utils';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroCard className={cn('rounded-xl bg-white shadow-card', className)} {...(p as any)} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroCardHeader className={cn('flex flex-col space-y-1.5 pb-0', className)} {...(p as any)} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold leading-none tracking-[-0.01em] text-[#1F1F3D]', className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroCardContent className={cn('pt-0', className)} {...(p as any)} />;
}
export { CardFooter };
