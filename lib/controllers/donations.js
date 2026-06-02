/**
 * Donations list + detail + edit + delete. Admin-only (session middleware).
 * All inputs validated through lib/validate.js before reaching MongoDB.
 * @module controllers/donations
 */

import { listDonations, getDonation, upsertDonation, removeDonation } from "../storage/donations.js";
import * as v from "../validate.js";

async function list(request, response, next) {
  try {
    const { application } = request.app.locals;
    // Filters from query string: never trust as Mongo operators.
    let campaign_id = null;
    if (request.query.campaign_id) {
      try { campaign_id = v.safeId(request.query.campaign_id); } catch { /* ignore */ }
    }
    const sourceVal = v.str(request.query.source, { max: 30, allowEmpty: true });
    const source = ["stripe", "givewp_migrated", "manual"].includes(sourceVal) ? sourceVal : null;
    const limit = v.nonNegInt(request.query.limit, { max: 200 }) ?? 50;
    const page = v.nonNegInt(request.query.page, { max: 10000 }) ?? 1;

    const items = await listDonations(application, {
      campaign_id,
      source,
      limit,
      skip: (page - 1) * limit,
      includeRefunded: true,
    });
    response.render("donation-donations", {
      title: request.__("donation.donations.title"),
      donations: items,
      filters: { campaign_id, source, page, limit },
      baseUrl: application.donationEndpoint,
    });
  } catch (err) { next(err); }
}

async function detail(request, response, next) {
  try {
    const { application } = request.app.locals;
    let id;
    try { id = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    const donation = await getDonation(application, id);
    if (!donation) return response.status(404).render("donation-not-found");
    response.render("donation-donation-edit", {
      title: donation.stripe_id,
      donation,
      baseUrl: application.donationEndpoint,
    });
  } catch (err) { next(err); }
}

async function update(request, response, next) {
  try {
    const { application } = request.app.locals;
    let id;
    try { id = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    const current = await getDonation(application, id);
    if (!current) return response.status(404).render("donation-not-found");

    // Only editable fields: display name, message, consent flag.
    // Stripe-canonical fields (amount, date, campaign, donor_id) are NEVER mutated.
    const display = v.str(request.body.display, { max: 60, allowEmpty: true });
    const message = v.str(request.body.message, { max: 200, allowEmpty: true });
    const next_ = {
      ...current,
      donor: {
        ...current.donor,
        display: display || null,
        message: message || null,
        consent_public: v.checkbox(request.body.consent_public),
      },
    };
    await upsertDonation(application, next_);
    response.redirect(`${application.donationEndpoint}/donations/${id}`);
  } catch (err) { next(err); }
}

async function remove(request, response, next) {
  try {
    const { application } = request.app.locals;
    let id;
    try { id = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    await removeDonation(application, id);
    response.redirect(`${application.donationEndpoint}/donations`);
  } catch (err) { next(err); }
}

export const donationsController = { list, detail, update, remove };
