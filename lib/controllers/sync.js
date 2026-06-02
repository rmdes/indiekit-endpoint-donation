/**
 * Manual Stripe sync trigger + rebuild trigger.
 * @module controllers/sync
 */

import { runFullSync } from "../sync/scheduler.js";
import { triggerRebuild } from "../build/trigger.js";

async function runOnce(request, response, next) {
  try {
    const { application } = request.app.locals;
    const result = await runFullSync(application);
    response.redirect(`${application.donationEndpoint}?synced=${result.upserted ?? 0}`);
  } catch (err) { next(err); }
}

async function triggerRebuildAction(request, response, next) {
  try {
    const { application } = request.app.locals;
    await triggerRebuild(application);
    response.redirect(`${application.donationEndpoint}?rebuild=triggered`);
  } catch (err) { next(err); }
}

export const syncController = { runOnce, triggerRebuild: triggerRebuildAction };
