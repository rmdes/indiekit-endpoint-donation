/**
 * Toggle a donation's public-display consent flag.
 * Admin-only (session middleware). Input validated to prevent NoSQL
 * injection via untyped params.
 * @module controllers/consent
 */

import { getDonation, updateConsent } from "../storage/donations.js";
import { triggerRebuild } from "../build/trigger.js";
import * as v from "../validate.js";

async function toggle(request, response, next) {
  try {
    const { application } = request.app.locals;
    let id;
    try { id = v.safeId(request.params.id); }
    catch { return response.status(400).render("donation-not-found"); }
    const current = await getDonation(application, id);
    if (!current) return response.status(404).render("donation-not-found");
    await updateConsent(application, id, !current.donor?.consent_public);
    await triggerRebuild(application);
    response.redirect(`${application.donationEndpoint}/donations/${id}`);
  } catch (err) { next(err); }
}

export const consentController = { toggle };
