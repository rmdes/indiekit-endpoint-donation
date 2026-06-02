/**
 * Stripe webhook signature verification.
 * Wraps stripe.webhooks.constructEvent so we have a single place to
 * adjust signing logic + log rejections.
 * @module stripe/verify-signature
 */

import Stripe from "stripe";

export function verifyStripeSignature({ payload, signature, secret }) {
  if (!signature) throw new Error("missing Stripe-Signature header");
  if (!secret) throw new Error("missing webhook secret");
  // Stripe SDK's static helper doesn't require an instance.
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}
