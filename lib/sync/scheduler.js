/**
 * Hourly background sync of Stripe Products → campaignsCache.
 * Stripe is the source of truth; this collection is just a queryable mirror.
 * @module sync/scheduler
 */

import { getStripe } from "../stripe/client.js";
import { mapProductToCampaign } from "../stripe/map-product.js";
import { upsertCampaign, listCampaigns, deactivateCampaign } from "../storage/campaigns.js";

let _interval = null;
let _running = false;

export async function runFullSync(Indiekit) {
  if (_running) return { skipped: true };
  _running = true;
  try {
    const application = Indiekit.config?.application ?? Indiekit;
    const cfg = application.donationConfig;
    const stripe = getStripe(cfg);

    // List all products + their default prices + payment links.
    // For now: just products + metadata. Payment Link resolution can come later
    // when we add `lib/stripe/payment-links.js`.
    const products = await stripe.products.list({ active: true, limit: 100 });

    let upserted = 0;
    for (const product of products.data) {
      const campaign = mapProductToCampaign(product, null);
      await upsertCampaign(application, campaign);
      upserted++;
    }

    // Mark previously-cached campaigns no longer in Stripe as inactive.
    const seenIds = new Set(products.data.map((p) => p.id));
    const cached = await listCampaigns(application);
    for (const c of cached) {
      if (!seenIds.has(c.stripe_product_id) && c.active) {
        await deactivateCampaign(application, c.stripe_product_id);
      }
    }

    console.log(`[Donation] sync ok: upserted ${upserted} campaigns`);
    return { upserted, deactivated: cached.length - upserted };
  } catch (err) {
    console.error(`[Donation] sync failed: ${err.message}`);
    return { error: err.message };
  } finally {
    _running = false;
  }
}

export function startStripeSync(Indiekit, options) {
  // Fire once on startup, then every hour.
  runFullSync(Indiekit).catch((e) => console.error("[Donation] initial sync error:", e));
  _interval = setInterval(
    () => runFullSync(Indiekit).catch((e) => console.error("[Donation] periodic sync error:", e)),
    options.syncInterval ?? 3600000,
  );
}

export function stopStripeSync() {
  if (_interval) clearInterval(_interval);
  _interval = null;
}
