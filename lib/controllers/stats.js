/**
 * Public JSON stats endpoints.
 * Consumed by the static Eleventy site at build time and (optionally)
 * by client-side fetches for live counter updates without rebuild.
 * @module controllers/stats
 */

import { lifetimeStats, listDonations, sumByCampaign } from "../storage/donations.js";
import { listCampaigns } from "../storage/campaigns.js";

async function json(request, response, next) {
  try {
    const { application } = request.app.locals;
    const [stats, allCampaigns, donations] = await Promise.all([
      lifetimeStats(application),
      listCampaigns(application),
      listDonations(application, { limit: 100 }),
    ]);

    // Public endpoint — never surface campaigns the admin chose to hide.
    const campaigns = allCampaigns.filter((c) => !c.hidden_on_public);

    // Augment campaigns with their current totals.
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const { total, count } = await sumByCampaign(application, c.stripe_product_id);
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
      }),
    );

    // Hide donor identifying info unless donor explicitly consented.
    const sanitized = donations.map((d) => ({
      id: d.stripe_id,
      date: d.date,
      amount_cents: d.amount_cents,
      currency: d.currency,
      campaign_id: d.campaign_id,
      recurring: d.recurring,
      donor: {
        display: d.donor?.consent_public ? d.donor?.display : null,
        consent_public: Boolean(d.donor?.consent_public),
        message: d.donor?.consent_public ? d.donor?.message : null,
      },
    }));

    response.setHeader("Cache-Control", "public, max-age=60");
    response.json({
      updated_at: new Date().toISOString(),
      currency: application.donationConfig?.currency ?? "EUR",
      lifetime_total_cents: stats.total ?? 0,
      lifetime_donor_count: stats.donor_count ?? 0,
      donation_count: stats.donation_count ?? 0,
      campaigns: enriched,
      donations: sanitized,
    });
  } catch (err) { next(err); }
}

async function byCampaign(request, response, next) {
  try {
    const { application } = request.app.locals;
    const { total, count } = await sumByCampaign(application, request.params.campaignId);
    response.setHeader("Cache-Control", "public, max-age=60");
    response.json({
      campaign_id: request.params.campaignId,
      raised_cents: total,
      donor_count: count,
      updated_at: new Date().toISOString(),
    });
  } catch (err) { next(err); }
}

export const statsController = { json, byCampaign };
