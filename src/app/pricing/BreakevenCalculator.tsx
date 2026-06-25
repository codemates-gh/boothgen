'use client';
import { useState } from 'react';

interface Props {
  commissionPct: number;
  proMonthlyPrice: number;
}

export default function BreakevenCalculator({ commissionPct, proMonthlyPrice }: Props) {
  const [avgBooking, setAvgBooking] = useState(600);
  const [eventsPerMonth, setEventsPerMonth] = useState(3);

  const freeMonthlyFee = eventsPerMonth * avgBooking * (commissionPct / 100);
  const savings = freeMonthlyFee - proMonthlyPrice;
  const breakEvenBookings = Math.ceil(proMonthlyPrice / (avgBooking * (commissionPct / 100)));
  const proWins = savings > 0;

  function fmt(n: number) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">See when Pro pays for itself</h2>
      <p className="text-gray-500 text-sm mb-8">Adjust the sliders to match your typical month</p>

      <div className="grid sm:grid-cols-2 gap-8 mb-8">
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">Avg. booking amount</label>
            <span className="text-sm font-bold text-orange-600">{fmt(avgBooking)}</span>
          </div>
          <input
            type="range" min={200} max={2000} step={50} value={avgBooking}
            onChange={e => setAvgBooking(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>$200</span><span>$2,000</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">New operators typically charge $500–$800/event</p>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">Events per month</label>
            <span className="text-sm font-bold text-orange-600">{eventsPerMonth}</span>
          </div>
          <input
            type="range" min={1} max={20} step={1} value={eventsPerMonth}
            onChange={e => setEventsPerMonth(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span><span>20</span>
          </div>
        </div>
      </div>

      <div className={`rounded-xl p-6 border-2 transition-colors ${proWins ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="grid sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Free plan costs you</p>
            <p className="text-2xl font-bold text-red-500">{fmt(freeMonthlyFee)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <p className="text-xs text-gray-400">{commissionPct}% × {eventsPerMonth} events × {fmt(avgBooking)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pro costs you</p>
            <p className="text-2xl font-bold text-blue-600">{fmt(proMonthlyPrice)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <p className="text-xs text-gray-400">flat rate, 0% per booking</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{proWins ? 'You save with Pro' : 'Free is cheaper'}</p>
            <p className={`text-2xl font-bold ${proWins ? 'text-green-600' : 'text-gray-500'}`}>
              {proWins ? fmt(savings) : fmt(Math.abs(savings))}
              <span className="text-sm font-normal text-gray-400">/mo</span>
            </p>
            <p className="text-xs text-gray-400">
              {proWins
                ? `Pro pays for itself in month 1`
                : `Switch to Pro at ${breakEvenBookings} events/mo`}
            </p>
          </div>
        </div>

        {!proWins && (
          <p className="text-center text-sm text-gray-500 mt-4 pt-4 border-t border-gray-200">
            At <strong>{breakEvenBookings} events/month</strong> averaging {fmt(avgBooking)}, Pro becomes the cheaper choice. Start free now and upgrade when the math makes sense.
          </p>
        )}
        {proWins && (
          <p className="text-center text-sm text-green-700 mt-4 pt-4 border-t border-green-200">
            At your volume, Pro saves you <strong>{fmt(savings * 12)}/year</strong> compared to the free plan.
          </p>
        )}
      </div>
    </div>
  );
}
