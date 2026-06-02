# @rmdes/indiekit-endpoint-donation

Stripe-backed donation endpoint for Indiekit. Treats Stripe Products as
campaigns, Stripe Checkout Sessions / PaymentIntents as donations,
captures donor consent via Stripe Payment Link custom fields, and feeds
a static Eleventy site with live JSON + rebuild triggers.

## Status

**Alpha — scaffold only.** Routes and views are in place; webhook
verification, sync scheduling, and storage are implemented. Tested
end-to-end is still TODO. Do not connect a live Stripe key against a
production webhook URL yet.

See [CLAUDE.md](./CLAUDE.md) for architecture, data model, and routes.

## Install

```bash
npm install @rmdes/indiekit-endpoint-donation stripe
```

```js
// indiekit.config.js
import DonationEndpoint from "@rmdes/indiekit-endpoint-donation";

export default {
  plugins: [
    "@indiekit/endpoint-auth",
    new DonationEndpoint({
      mountPath: "/donation",
      // siteDir + rebuildTrigger usually picked up from env vars
    }),
    // ...
  ],
};
```

## Environment

```bash
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
INDIEKIT_DONATION_SITE_DIR=/app/data/eleventy-site
INDIEKIT_DONATION_REBUILD_TRIGGER=/app/data/eleventy-site/.rebuild-trigger
INDIEKIT_DONATION_CURRENCY=EUR
```

## Stripe setup (one-time)

1. Create a **Product** per campaign in Stripe Dashboard. Set product
   metadata: `goal_cents`, `subtitle`, `campaign_starts`, `campaign_ends`,
   `display_order`.
2. Create a **Payment Link** for each Product. Add 3 custom fields:
   - `consent` — dropdown: "Oui, avec mon nom" / "Oui, anonymement" /
     "Non, garder privé" (required)
   - `display_name` — text, optional (≤60 chars)
   - `message` — text, optional (≤200 chars)
3. Create a **Webhook endpoint** in Stripe pointing at
   `https://yoursite.example/donation/webhook`. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `charge.refunded`
4. Copy the webhook signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

## Admin UI

- `/donation` — dashboard (lifetime stats, recent donations, active campaigns)
- `/donation/donations` — full donation list with filters
- `/donation/donations/:id` — edit a single donation (display name, message, consent)
- `/donation/campaigns` — cached campaign list (synced from Stripe)
- `/donation/manual` — record an offline donation (cash, bank transfer)
- `POST /donation/sync` — trigger an immediate Stripe Product sync
- `POST /donation/rebuild` — touch the rebuild trigger file

## Public API

- `GET /donation/stats.json` — full live state (campaigns + recent
  donations, donor names hidden if consent is false). Cache-Control: 60s.
- `GET /donation/stats/:campaignId.json` — single-campaign totals.
- `POST /donation/webhook` — Stripe webhook receiver (rejects without
  signature).

## License

MIT
