/**
 * Public JSON stats endpoints (unauthenticated since v0.1.0-alpha.4 — the
 * donation-campaign block fetches stats.json client-side).
 *
 * Privacy contract for the public payload:
 * - Campaigns with `hidden_on_public` are NEVER surfaced (list OR by-id).
 * - NO individual donation records are exposed — only campaign/lifetime
 *   aggregates. (The pre-alpha.4 admin-only payload carried a sanitized
 *   `donations` array; public exposure of per-donation amount/date/campaign
 *   could de-anonymize non-consenting donors, and no consumer needs it. If a
 *   future transparency surface wants a donor wall, add a dedicated
 *   consenting-donors-only endpoint — do not re-add `donations` here.)
 * - Errors never reach indiekit's core error handler (it includes `stack`
 *   in JSON responses); these routes return an opaque 500 instead.
 * @module controllers/stats
 */

import { lifetimeStats, sumByCampaign } from "../storage/donations.js";
import { listCampaigns, getCampaign } from "../storage/campaigns.js";

/**
 * Campaigns the admin has not hidden from the public site.
 * @param {Array<object>} campaigns
 * @returns {Array<object>}
 */
export function publicCampaigns(campaigns) {
  return (campaigns || []).filter((c) => !c.hidden_on_public);
}

/**
 * Public shape of one campaign (no internal/sync fields).
 * @param {object} c Campaign cache document
 * @param {{ total: number, count: number }} sums
 * @returns {object}
 */
export function shapeCampaign(c, { total, count }) {
  return {
    id: c.stripe_product_id,
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    goal_cents: c.goal_cents,
    raised_cents: total,
    donor_count: count,
    active: c.active,
    started: c.started,
    ends: c.ends,
    stripe_payment_link: c.stripe_payment_link,
  };
}

// In-process payload cache. Bounds the per-campaign aggregation fan-out to at
// most one computation per TTL regardless of public traffic (client
// Cache-Control alone doesn't collapse concurrent load — the site's nginx
// doesn't proxy-cache). ponytail: in-process cache; move the N-per-request
// sumByCampaign to one grouped aggregation if campaign count grows.
const CACHE_TTL_MS = 30_000;
let statsCache = { at: 0, body: null };

async function json(request, response) {
  try {
    if (statsCache.body && Date.now() - statsCache.at < CACHE_TTL_MS) {
      response.setHeader("Cache-Control", "public, max-age=60");
      return response.json(statsCache.body);
    }

    const { application } = request.app.locals;
    const [stats, allCampaigns] = await Promise.all([
      lifetimeStats(application),
      listCampaigns(application),
    ]);

    const enriched = await Promise.all(
      publicCampaigns(allCampaigns).map(async (c) =>
        shapeCampaign(c, await sumByCampaign(application, c.stripe_product_id)),
      ),
    );

    const body = {
      updated_at: new Date().toISOString(),
      currency: application.donationConfig?.currency ?? "EUR",
      lifetime_total_cents: stats.total ?? 0,
      lifetime_donor_count: stats.donor_count ?? 0,
      donation_count: stats.donation_count ?? 0,
      campaigns: enriched,
    };
    statsCache = { at: Date.now(), body };

    response.setHeader("Cache-Control", "public, max-age=60");
    response.json(body);
  } catch (err) {
    console.error("[Donation] stats error", err);
    response.status(500).json({ error: "internal_error" });
  }
}

async function byCampaign(request, response) {
  try {
    const { application } = request.app.locals;
    // Look the campaign up first: unknown AND hidden campaigns both 404, so
    // this endpoint can't side-channel around the admin's hidden_on_public.
    const campaign = await getCampaign(application, request.params.campaignId);
    if (!campaign || campaign.hidden_on_public) {
      return response.status(404).json({ error: "not_found" });
    }
    const { total, count } = await sumByCampaign(
      application,
      campaign.stripe_product_id,
    );
    response.setHeader("Cache-Control", "public, max-age=60");
    response.json({
      campaign_id: campaign.stripe_product_id,
      raised_cents: total,
      donor_count: count,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Donation] stats error", err);
    response.status(500).json({ error: "internal_error" });
  }
}

export const statsController = { json, byCampaign };
