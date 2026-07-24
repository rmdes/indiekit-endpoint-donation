import { test } from "node:test";
import assert from "node:assert/strict";
import { publicCampaigns, shapeCampaign } from "../lib/controllers/stats.js";
import DonationEndpoint from "../index.js";

// Security-regression coverage for the alpha.4 public exposure of the stats
// routes (review findings 2026-07-24): hidden-campaign filtering, no donation
// records in the public shape, and route placement (public vs admin).

test("publicCampaigns filters hidden_on_public", () => {
  const campaigns = [
    { stripe_product_id: "prod_a", hidden_on_public: false },
    { stripe_product_id: "prod_b", hidden_on_public: true },
    { stripe_product_id: "prod_c" },
  ];
  assert.deepEqual(
    publicCampaigns(campaigns).map((c) => c.stripe_product_id),
    ["prod_a", "prod_c"],
  );
  assert.deepEqual(publicCampaigns(undefined), []);
});

test("shapeCampaign exposes only the public field set", () => {
  const shaped = shapeCampaign(
    {
      stripe_product_id: "prod_a",
      title: "T",
      subtitle: "S",
      description: "D",
      goal_cents: 100_000,
      active: true,
      started: "2026-01-01T00:00:00.000Z",
      ends: null,
      stripe_payment_link: "https://donate.stripe.com/x",
      // internal fields that must NOT leak
      hidden_on_public: false,
      last_synced_at: "2026-07-24T00:00:00.000Z",
      display_order: 1,
      _id: "mongo-id",
    },
    { total: 42_00, count: 3 },
  );
  assert.deepEqual(Object.keys(shaped).sort(), [
    "active", "description", "donor_count", "ends", "goal_cents", "id",
    "raised_cents", "started", "stripe_payment_link", "subtitle", "title",
  ]);
  assert.equal(shaped.id, "prod_a");
  assert.equal(shaped.raised_cents, 42_00);
  assert.equal(shaped.donor_count, 3);
});

test("stats routes are public; admin router no longer carries them", () => {
  const ep = new DonationEndpoint();
  const paths = (router) =>
    router.stack.filter((l) => l.route).map((l) => l.route.path);

  const publicPaths = paths(ep.routesPublic);
  assert.ok(publicPaths.includes("/stats.json"), "stats.json public");
  assert.ok(publicPaths.includes("/stats/:campaignId.json"), "byCampaign public");
  assert.ok(publicPaths.includes("/webhook"), "webhook public");

  const adminPaths = paths(ep.routes);
  assert.ok(!adminPaths.some((p) => p.startsWith("/stats")), "no stats on admin router");
});
