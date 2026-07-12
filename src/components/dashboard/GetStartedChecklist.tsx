import Link from 'next/link';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Step = { label: string; description: string; href: string; done: boolean };

export function GetStartedChecklist({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="border-brand/30 bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-base">Get Started</CardTitle>
          <span className="text-sm text-gray-400">{doneCount} of {steps.length} complete</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>
      <CardContent className="pt-1 divide-y divide-gray-50">
        {steps.map(step => (
          step.done ? (
            <div key={step.label} className="flex items-center gap-3 px-1 py-3 opacity-40">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-gray-500 line-through">{step.label}</p>
            </div>
          ) : (
            <Link key={step.label} href={step.href}>
              <div className="flex items-center gap-3 px-1 py-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{step.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </Link>
          )
        ))}
      </CardContent>
    </Card>
  );
}
