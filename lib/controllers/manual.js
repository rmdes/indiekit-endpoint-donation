/**
 * Manual offline-donation entry — fills the gap for cash/bank-transfer
 * gifts that never went through Stripe. Admin-only (session middleware).
 * @module controllers/manual
 */

import { upsertDonation } from "../storage/donations.js";
import { listCampaigns } from "../storage/campaigns.js";
import { triggerRebuild } from "../build/trigger.js";
import * as v from "../validate.js";

async function form(request, response, next) {
  try {
    const { application } = request.app.locals;
    const campaigns = await listCampaigns(application, { active: true });
    response.render("donation-manual", {
      title: request.__("donation.manual.title"),
      campaigns,
      baseUrl: application.donationEndpoint,
    });
  } catch (err) { next(err); }
}

async function create(request, response, next) {
  const { application } = request.app.locals;
  const fail = (reason) =>
    response.status(400).render("donation-manual-error", {
      title: request.__("donation.manual.error.title"),
      message: reason,
      baseUrl: application.donationEndpoint,
    });

  try {
    // Native validation — see lib/validate.js for the helpers.
    const amount_cents = v.cents(request.body.amount);
    if (amount_cents === null) return fail("Montant invalide.");

    let campaign_id;
    try {
      campaign_id = v.safeId(request.body.campaign_id);
    } catch {
      return fail("Identifiant de campagne invalide.");
    }

    const date = v.isoDate(request.body.date);
    if (!date) return fail("Date invalide.");

    const currencyCode = v.currency(request.body.currency)
      || application.donationConfig?.currency
      || "EUR";

    const donor_display = v.str(request.body.donor_display, { max: 60, allowEmpty: true });
    const message = v.str(request.body.message, { max: 200, allowEmpty: true });
    const note = v.str(request.body.note, { max: 500, allowEmpty: true });

    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const donation = {
      stripe_id: id,
      date: new Date(date),
      amount_cents,
      currency: currencyCode,
      campaign_id,
      recurring: false,
      donor: {
        donor_id: `manual_${id}`,
        display: donor_display || null,
        consent_public: v.checkbox(request.body.consent_public),
        message: message || null,
      },
      source: "manual",
      refunded: false,
      meta: {
        entered_by: typeof request.session?.me === "string" ? request.session.me : "unknown",
        note: note || null,
      },
    };
    await upsertDonation(application, donation);
    await triggerRebuild(application);
    response.redirect(application.donationEndpoint);
  } catch (err) { next(err); }
}

export const manualController = { form, create };
