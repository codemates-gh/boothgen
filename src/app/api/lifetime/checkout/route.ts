export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma/client';

const TIER_PRICES_CENTS = [30000, 40000, 50000];

export async function POST(req: NextRequest) {
  const { name, email, company } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
  }

  // Read founding settings
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['founding_enabled', 'founding_round', 'founding_spots_limit'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));

  if (map.founding_enabled === 'false') {
    return NextResponse.json({ error: 'The Founding Member offer is currently paused.' }, { status: 400 });
  }

  const round     = Math.max(1, Math.min(3, parseInt(map.founding_round ?? '1') || 1));
  const spotLimit = parseInt(map.founding_spots_limit ?? '5') || 5;

  const claimed = await prisma.foundingMember.count({
    where: { tier: round, status: { in: ['PAID', 'SETUP_COMPLETE'] } },
  });

  if (claimed >= spotLimit) {
    return NextResponse.json({ error: 'All spots in this batch have been claimed. Check back soon.' }, { status: 400 });
  }

  const amountCents = TIER_PRICES_CENTS[round - 1];
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email.toLowerCase(),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: `Booth Genius Founding Member — Round ${round}`,
          description: 'Lifetime Pro access. Zero monthly fees. Zero commission cuts. Forever.',
          images: [],
        },
      },
    }],
    metadata: {
      source: 'founding_member',
      founding_tier:    String(round),
      founding_email:   email.toLowerCase(),
      founding_name:    name.trim(),
      founding_company: company?.trim() ?? '',
    },
    payment_intent_data: {
      metadata: {
        source: 'founding_member',
        founding_tier:    String(round),
        founding_email:   email.toLowerCase(),
        founding_name:    name.trim(),
        founding_company: company?.trim() ?? '',
      },
    },
    success_url: `${appUrl}/lifetime/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/lifetime`,
    allow_promotion_codes: false,
  });

  return NextResponse.json({ url: session.url });
}
