/**
 * Donation admin dashboard.
 * Shows lifetime stats, recent donations, active campaigns, and quick actions.
 * @module controllers/dashboard
 */

import { lifetimeStats, listDonations } from "../storage/donations.js";
import { listCampaigns } from "../storage/campaigns.js";

async function get(request, response, next) {
  const { application } = request.app.locals;

  try {
    const [stats, recent, campaigns] = await Promise.all([
      lifetimeStats(application),
      listDonations(application, { limit: 10 }),
      listCampaigns(application),
    ]);

    const activeCampaigns = campaigns.filter((c) => c.active);
    const archivedCampaigns = campaigns.filter((c) => !c.active);

    response.render("donation-dashboard", {
      title: request.__("donation.title"),
      stats: {
        lifetime_total_cents: stats.total ?? 0,
        donation_count: stats.donation_count ?? 0,
        donor_count: stats.donor_count ?? 0,
        active_campaign_count: activeCampaigns.length,
      },
      recent,
      activeCampaigns,
      archivedCampaigns,
      currency: application.donationConfig?.currency ?? "EUR",
      baseUrl: application.donationEndpoint ?? "/donation",
    });
  } catch (err) {
    next(err);
  }
}

export const dashboardController = { get };
