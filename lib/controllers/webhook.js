/**
 * Stripe webhook receiver.
 * @module controllers/webhook
 *
 * Implementation notes:
 * - express.raw() must be applied at this route so signature verification
 *   sees the original bytes (see index.js routesPublic).
 * - Signature verification rejects unsigned / replayed payloads.
 * - Only events listed in HANDLED_EVENTS are processed; everything else
 *   returns 200 OK without action (so Stripe doesn't retry).
 */

import { verifyStripeSignature } from "../stripe/verify-signature.js";
import { mapSessionToDonation } from "../stripe/map-session.js";
import { upsertDonation, markRefunded } from "../storage/donations.js";
import { triggerRebuild } from "../build/trigger.js";

// Locked-in per chardonsbleus decision 2026-05-21:
//   - checkout.session.completed
//   - checkout.session.async_payment_succeeded
//   - invoice.paid (recurring)
//   - charge.refunded (rollback)
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "charge.refunded",
]);

async function receive(request, response, next) {
  try {
    const { application } = request.app.locals;
    const cfg = application.donationConfig ?? {};
    if (!cfg.stripeWebhookSecret) {
      console.error("[Donation] STRIPE_WEBHOOK_SECRET missing");
      return response.status(503).json({ error: "webhook secret not configured" });
    }

    const sig = request.headers["stripe-signature"];
    let event;
    try {
      event = verifyStripeSignature({
        payload: request.body,            // Buffer from express.raw()
        signature: sig,
        secret: cfg.stripeWebhookSecret,
      });
    } catch (err) {
      console.warn(`[Donation] webhook signature rejected: ${err.message}`);
      return response.status(400).json({ error: "invalid signature" });
    }

    if (!HANDLED_EVENTS.has(event.type)) {
      // Acknowledge so Stripe doesn't retry; we just don't act on it.
      return response.status(200).json({ received: true, handled: false, type: event.type });
    }

    if (event.type === "charge.refunded") {
      const stripeId = event.data?.object?.payment_intent ?? event.data?.object?.id;
      if (stripeId) await markRefunded(application, stripeId);
    } else {
      const donation = await mapSessionToDonation(event, cfg);
      if (donation) await upsertDonation(application, donation);
    }

    await triggerRebuild(application);
    return response.status(200).json({ received: true, handled: true, type: event.type });
  } catch (err) {
    next(err);
  }
}

export const webhookController = { receive };
