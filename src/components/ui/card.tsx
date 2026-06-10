
import { cn } from '@/lib/utils';
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)} {...p} />; }
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...p} />; }
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...p} />; }
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('p-6 pt-0', className)} {...p} />; }
