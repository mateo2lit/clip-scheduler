import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export function getPlanFromPriceId(priceId: string): 'creator' | 'team' | 'none' {
  if (priceId === process.env.STRIPE_CREATOR_PRICE_ID) return 'creator';
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return 'team';
  return 'none';
}
