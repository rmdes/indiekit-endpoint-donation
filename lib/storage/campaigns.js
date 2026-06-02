/**
 * Campaign cache CRUD.
 * Campaigns are owned by Stripe; this collection is a queryable cache
 * synced from Stripe Products hourly + on-demand.
 * @module storage/campaigns
 */

function collection(application) {
  return application.collections?.get("campaignsCache");
}

export async function upsertCampaign(application, campaign) {
  const c = collection(application);
  if (!c) throw new Error("campaignsCache unavailable");
  await c.updateOne(
    { stripe_product_id: campaign.stripe_product_id },
    { $set: { ...campaign, last_synced_at: new Date() } },
    { upsert: true },
  );
}

export async function listCampaigns(application, { active } = {}) {
  const c = collection(application);
  if (!c) return [];
  const query = {};
  if (typeof active === "boolean") query.active = active;
  return c.find(query).sort({ active: -1, display_order: 1, ends: -1 }).toArray();
}

export async function getCampaign(application, stripe_product_id) {
  const c = collection(application);
  if (!c) return null;
  return c.findOne({ stripe_product_id });
}

export async function deactivateCampaign(application, stripe_product_id) {
  const c = collection(application);
  if (!c) return;
  await c.updateOne(
    { stripe_product_id },
    { $set: { active: false, last_synced_at: new Date() } },
  );
}
