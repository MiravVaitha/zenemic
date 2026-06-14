import Stripe from 'stripe';
import { env, features } from '../config/env';
import { notConfigured, badRequest } from '../lib/errors';

let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!features.stripe) throw notConfigured('Stripe');
  if (!client) {
    // Use the SDK's pinned API version (omit to avoid a version-literal mismatch).
    client = new Stripe(env.STRIPE_SECRET_KEY as string);
  }
  return client;
}

export const stripeEnabled = features.stripe;
export const stripePublishableKey = env.STRIPE_PUBLISHABLE_KEY ?? null;

export interface SplitPaymentLink {
  id: string;
  url: string;
  paymentLinkId: string;
}

/**
 * Create a shareable Stripe Payment Link for one person's share of a bill.
 * Stripe Payment Links need a Price, so we create an inline ad-hoc price first.
 */
export async function createSplitPaymentLink(params: {
  amountMinor: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
}): Promise<SplitPaymentLink> {
  const stripe = getStripe();
  if (params.amountMinor <= 0) throw badRequest('Share amount must be positive');

  const price = await stripe.prices.create({
    currency: params.currency,
    unit_amount: params.amountMinor,
    product_data: { name: params.description },
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: params.metadata,
  });

  return { id: price.id, url: link.url, paymentLinkId: link.id };
}

/** Deactivate a payment link (e.g. when a split is recomputed or canceled). */
export async function deactivatePaymentLink(paymentLinkId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentLinks.update(paymentLinkId, { active: false });
}

/** Verify + parse a Stripe webhook payload. `rawBody` must be the unparsed body. */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) throw notConfigured('Stripe webhook secret');
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
