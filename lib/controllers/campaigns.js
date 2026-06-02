/**
 * Campaign list + detail + local-override edit.
 * Admin-only (session middleware). Inputs validated to prevent NoSQL
 * injection via untyped params + body fields.
 *
 * Campaigns are authoritatively defined in Stripe Products — this admin
 * UI is read-mostly. The only writable fields are local overrides:
 *   - hidden_on_public (hide from /soutenir/ + /transparence/)
 *   - display_order   (sort hint)
 * @module controllers/campaigns
 */

import { listCampaigns, getCampaign, upsertCampaign } from "../storage/campaigns.js";
import { sumByCampaign } from "../storage/donations.js";
import * as v from "../validate.js";

async function list(request, response, next) {
  try {
    const { application } = request.app.locals;
    const campaigns = await listCampaigns(application);
    const augmented = await Promise.all(
      campaigns.map(async (c) => {
        const { total, count } = await sumByCampaign(application, c.stripe_product_id);
        return { ...c, raised_cents: total, donor_count: count };
      }),
    );
    response.render("donation-campaigns", {
      title: request.__("donation.campaigns.title"),
      campaigns: augmented,
      baseUrl: application.donationEndpoint,
    });
  } catch (err) { next(err); }
}

async function detail(request, response, next) {
  try {
    const { application } = request.app.locals;
    let productId;
    try { productId = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    const c = await getCampaign(application, productId);
    if (!c) return response.status(404).render("donation-not-found");
    const { total, count } = await sumByCampaign(application, c.stripe_product_id);
    response.render("donation-campaign-edit", {
      title: c.title,
      campaign: { ...c, raised_cents: total, donor_count: count },
      baseUrl: application.donationEndpoint,
    });
  } catch (err) { next(err); }
}

async function update(request, response, next) {
  try {
    const { application } = request.app.locals;
    let productId;
    try { productId = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    const c = await getCampaign(application, productId);
    if (!c) return response.status(404).render("donation-not-found");

    const display_order = v.nonNegInt(request.body.display_order) ?? (c.display_order ?? 100);
    await upsertCampaign(application, {
      ...c,
      hidden_on_public: v.checkbox(request.body.hidden_on_public),
      display_order,
    });
    response.redirect(`${application.donationEndpoint}/campaigns/${productId}`);
  } catch (err) { next(err); }
}

export const campaignsController = { list, detail, update };
