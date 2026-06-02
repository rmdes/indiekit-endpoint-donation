import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import rateLimit from "express-rate-limit";
import { waitForReady } from "@rmdes/indiekit-startup-gate";

import { dashboardController } from "./lib/controllers/dashboard.js";
import { donationsController } from "./lib/controllers/donations.js";
import { campaignsController } from "./lib/controllers/campaigns.js";
import { manualController } from "./lib/controllers/manual.js";
import { syncController } from "./lib/controllers/sync.js";
import { consentController } from "./lib/controllers/consent.js";
import { webhookController } from "./lib/controllers/webhook.js";
import { statsController } from "./lib/controllers/stats.js";

import { createIndexes } from "./lib/storage/indexes.js";
import { startStripeSync, stopStripeSync } from "./lib/sync/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaults = {
  mountPath: "/donation",
  // Hourly background sync of Stripe Products → campaigns cache.
  syncInterval: 3600000,
  // Site directory for rebuild trigger (file touch).
  siteDir: process.env.INDIEKIT_DONATION_SITE_DIR ?? "/app/data/eleventy-site",
  rebuildTrigger: process.env.INDIEKIT_DONATION_REBUILD_TRIGGER
    ?? "/app/data/eleventy-site/.rebuild-trigger",
  currency: process.env.INDIEKIT_DONATION_CURRENCY ?? "EUR",
  // Stripe credentials from env. Required at runtime; checked on init.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};

export default class DonationEndpoint {
  name = "Donation endpoint";

  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.mountPath = this.options.mountPath;
  }

  get localesDirectory() {
    return path.join(__dirname, "locales");
  }

  get viewsDirectory() {
    return path.join(__dirname, "views");
  }

  // Adds "Dons" to the admin sidebar.
  get navigationItems() {
    return {
      href: this.options.mountPath,
      text: "donation.title",
      requiresDatabase: true,
    };
  }

  // Adds a quick-action tile on the indiekit dashboard.
  get shortcutItems() {
    return {
      url: path.join(this.options.mountPath, "manual"),
      name: "donation.manual.action",
      iconName: "createPost",
      requiresDatabase: true,
    };
  }

  // Authenticated admin routes — wrapped by indiekit's session middleware.
  get routes() {
    const router = express.Router();

    router.get("/", dashboardController.get);

    router.get("/donations", donationsController.list);
    router.get("/donations/:id", donationsController.detail);
    router.post("/donations/:id/edit", donationsController.update);
    router.post("/donations/:id/consent", consentController.toggle);
    router.post("/donations/:id/delete", donationsController.remove);

    router.get("/campaigns", campaignsController.list);
    router.get("/campaigns/:id", campaignsController.detail);
    router.post("/campaigns/:id/edit", campaignsController.update);

    router.get("/manual", manualController.form);
    router.post("/manual", manualController.create);

    router.post("/sync", syncController.runOnce);
    router.post("/rebuild", syncController.triggerRebuild);

    // Stats JSON (donor-data-sanitized but still admin-only as defense
    // in depth — the public Eleventy site reads MongoDB directly via the
    // _data/donations.js loader, not via this HTTP endpoint).
    router.get("/stats.json", statsController.json);
    router.get("/stats/:campaignId.json", statsController.byCampaign);

    return router;
  }

  // Public routes — Stripe webhook ONLY. Everything else (stats, donations,
  // campaigns) is under the admin-protected `routes` getter above.
  //
  // Rate-limit the webhook endpoint to bound damage from a misbehaving
  // upstream OR a forged-but-unsigned flood. Stripe typically sends one
  // event at a time with exponential backoff on failure — 60/min/IP is
  // well above legitimate traffic and well below "abuse" threshold.
  get routesPublic() {
    const router = express.Router();

    const webhookLimiter = rateLimit({
      windowMs: 60 * 1000,        // 1 minute window
      max: 60,                    // 60 requests per IP per window
      message: { error: "rate_limited" },
      standardHeaders: true,
      legacyHeaders: false,
    });

    router.post(
      "/webhook",
      webhookLimiter,
      express.raw({ type: "application/json" }),
      webhookController.receive,
    );

    return router;
  }

  init(Indiekit) {
    Indiekit.addEndpoint(this);

    Indiekit.addCollection("donations");
    Indiekit.addCollection("campaignsCache");
    Indiekit.addCollection("donationMeta");

    // Make config + DB accessor available to controllers via application locals.
    Indiekit.config.application.donationConfig = this.options;
    Indiekit.config.application.donationEndpoint = this.mountPath;
    Indiekit.config.application.getDonationDb = () => Indiekit.database;

    // Background Stripe Product sync — only starts after Mongo is connected.
    if (Indiekit.config.application.mongodbUrl && this.options.stripeSecretKey) {
      this._stopGate = waitForReady(
        async () => {
          await createIndexes(Indiekit);
          startStripeSync(Indiekit, this.options);
        },
        { label: "Donation" },
      );
    } else if (!this.options.stripeSecretKey) {
      console.warn(
        "[Donation] STRIPE_SECRET_KEY not set — admin UI will load but " +
        "campaigns sync and webhook verification are disabled.",
      );
    }
  }

  destroy() {
    this._stopGate?.();
    stopStripeSync();
  }
}
