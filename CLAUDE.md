# CLAUDE.md — Donation Endpoint

## Package Overview

`@rmdes/indiekit-endpoint-donation` is an Indiekit plugin that bridges
Stripe to a static site for donations. It treats **Stripe Products as
campaigns** and **Checkout Sessions / PaymentIntents as donations**,
caches them in MongoDB, exposes them as JSON for the static site to
consume, and triggers an Eleventy rebuild on each webhook.

**Key Capabilities:**

- Pulls Stripe Products → campaigns (with metadata like `goal_cents`,
  `subtitle`, dates).
- Handles Stripe webhooks for one-shot + recurring donations + delayed
  payments (Bancontact, SEPA).
- Captures donor consent via Stripe Payment Link custom fields.
- Admin UI: dashboard, donations list, manual offline-gift entry,
  campaign sync trigger, consent toggle per donation.
- Public JSON API consumed by Eleventy at build time, or by client-side
  fetches if the user wants live counter updates without rebuild.
- File-touch rebuild trigger compatible with `eleventy --watch`.

**npm Package:** `@rmdes/indiekit-endpoint-donation`

**Version:** See `package.json` (currently alpha; follows semantic versioning)

**Mount Path:** `/donation` (default, configurable)

**Deployed on:** chardonsbleus only (optional endpoint tier in registry)

## Architecture

### Data flow

```
   Stripe (canonical)                 Indiekit                       Eleventy
   ──────────────────                ──────────                      ────────
   Products  ─── hourly sync ───►  campaignsCache  ──┐
                                                      ├──► _data/donations.js
   Checkout Sessions ── webhook ──► donations  ───────┤        │
                                                      │        ▼
   custom_fields (consent)  ─────►  donor.consent_*  │     static build
                                        │             │        │
                                        ▼             │        ▼
                                  trigger.touch() ────┴───►  --watch rebuild
```

### MongoDB collections

**donations**

```js
{
  _id: ObjectId,
  stripe_id: String,          // "cs_…" or "pi_…", unique
  date: Date,
  amount_cents: Number,
  currency: String,
  campaign_id: String,        // Stripe product id ("prod_…")
  recurring: Boolean,
  donor: {
    donor_id: String,         // stable customer id from Stripe / GiveWP donor id for migrated
    display: String | null,   // null = show as "Anonyme"
    consent_public: Boolean,
    message: String | null,
  },
  source: "stripe" | "givewp_migrated" | "manual",
  refunded: Boolean,
  refunded_at: Date | null,
  meta: Object,               // raw stripe event metadata for debugging
  created_at: Date,
  updated_at: Date,
}
```

Indexes:
- `stripe_id` (unique)
- `campaign_id, date`
- `donor.donor_id, date`
- `source, date`
- `refunded` (sparse — for the rare refund query)

**campaignsCache**

```js
{
  _id: ObjectId,
  stripe_product_id: String,  // unique
  title: String,
  subtitle: String,
  description: String,
  goal_cents: Number,
  active: Boolean,
  started: Date | null,
  ends: Date | null,
  display_order: Number,
  stripe_payment_link: String | null,
  last_synced_at: Date,
}
```

Indexes:
- `stripe_product_id` (unique)
- `active, display_order`

**donationMeta**

Singleton key-value collection for things like last full Stripe sync
timestamp, last successful webhook, etc.

## Routes

### Admin (auth required — protected by indiekit session)

| Method | Path                            | Controller       |
|--------|---------------------------------|------------------|
| GET    | `/`                             | dashboard.get    |
| GET    | `/donations`                    | donations.list   |
| GET    | `/donations/:id`                | donations.detail |
| POST   | `/donations/:id/edit`           | donations.update |
| POST   | `/donations/:id/consent`        | consent.toggle   |
| POST   | `/donations/:id/delete`         | donations.remove |
| GET    | `/campaigns`                    | campaigns.list   |
| GET    | `/campaigns/:id`                | campaigns.detail |
| POST   | `/campaigns/:id/edit`           | campaigns.update |
| GET    | `/manual`                       | manual.form      |
| POST   | `/manual`                       | manual.create    |
| POST   | `/sync`                         | sync.runOnce     |
| POST   | `/rebuild`                      | sync.triggerRebuild |

### Public

| Method | Path                            | Controller        |
|--------|---------------------------------|-------------------|
| POST   | `/webhook`                      | webhook.receive   |
| GET    | `/stats.json`                   | stats.json        |
| GET    | `/stats/:campaignId.json`       | stats.byCampaign  |

## Environment

| Variable                          | Required | Notes                                  |
|-----------------------------------|----------|----------------------------------------|
| `STRIPE_SECRET_KEY`               | yes      | `sk_live_…`                            |
| `STRIPE_WEBHOOK_SECRET`           | yes      | `whsec_…`, from Stripe Dashboard       |
| `MONGO_URL`                       | yes      | Provided by Cloudron                   |
| `INDIEKIT_DONATION_SITE_DIR`      | no       | Path to Eleventy site (for rebuild)    |
| `INDIEKIT_DONATION_REBUILD_TRIGGER` | no    | Sentinel file path (defaults to `$SITE_DIR/.rebuild-trigger`) |
| `INDIEKIT_DONATION_CURRENCY`      | no       | `EUR` default                          |

## Status

Alpha. Scaffolded May 2026, deployed on chardonsbleus. See README.md for installation and environment setup. See index.js and lib/ for current implementation details.

## Plugin Origin

**ORIGINAL plugin** — no upstream `@indiekit/*` equivalent. Developed for
chardonsbleus fundraising campaigns.

**Registry status:** Endpoints tier in `indiekit-cloudron` (optional,
`default_enabled: false`). Enabled only on chardonsbleus site.

## Installation & Configuration

See README.md for Stripe setup and environment variables.

In `indiekit.config.js`:

```javascript
import DonationEndpoint from "@rmdes/indiekit-endpoint-donation";

export default {
  plugins: [
    new DonationEndpoint({
      mountPath: "/donation",
      // siteDir and rebuildTrigger usually from env vars:
      // INDIEKIT_DONATION_SITE_DIR
      // INDIEKIT_DONATION_REBUILD_TRIGGER
    }),
    // ...
  ],
};
```

## Related Documentation

- **Design & data model:** README.md, this file
- **Deployed on:** `/sites/chardonsbleus/` in indiekit-cloudron
- **Plugin registry entry:** `plugin-registry.yaml` endpoints tier (key: `donation`)
