/**
 * Lazy Stripe SDK singleton.
 * Created on first access so the plugin can boot even with no key
 * (admin UI still loads, just shows a "Stripe not configured" banner).
 * @module stripe/client
 */

import Stripe from "stripe";

let _client = null;

export function getStripe(cfg) {
  if (!cfg?.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  if (!_client) {
    _client = new Stripe(cfg.stripeSecretKey, {
      // Pin API version to avoid surprise behavior changes; bump
      // intentionally when reviewing Stripe changelogs.
      apiVersion: "2025-09-30.acacia",
      typescript: false,
      maxNetworkRetries: 2,
      timeout: 15000,
      appInfo: {
        name: "indiekit-endpoint-donation",
        version: "0.1.0",
      },
    });
  }
  return _client;
}
