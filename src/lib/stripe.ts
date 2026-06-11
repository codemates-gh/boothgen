import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10',
  typescript: true,
});

export const PLATFORM_FEE_PERCENT = parseFloat(
  process.env.STRIPE_PLATFORM_FEE_PERCENT ?? '2'
);

/** Returns the application_fee_amount for a payment (in cents). */
export function applicationFee(amountCents: number): number {
  return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
}
