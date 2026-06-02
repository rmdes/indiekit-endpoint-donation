/**
 * MongoDB index creation for donation collections.
 * Called once on init() after waitForReady gate clears.
 * @module storage/indexes
 */

export async function createIndexes(Indiekit) {
  const collections = Indiekit.config.application.collections;
  if (!collections) return;

  const donations = collections.get("donations");
  if (donations) {
    await donations.createIndex({ stripe_id: 1 }, { unique: true, name: "stripe_id_unique" });
    await donations.createIndex({ campaign_id: 1, date: -1 }, { name: "campaign_date" });
    await donations.createIndex({ "donor.donor_id": 1, date: -1 }, { name: "donor_date" });
    await donations.createIndex({ source: 1, date: -1 }, { name: "source_date" });
    await donations.createIndex({ refunded: 1 }, { sparse: true, name: "refunded_sparse" });
    await donations.createIndex({ date: -1 }, { name: "date_desc" });
  }

  const campaigns = collections.get("campaignsCache");
  if (campaigns) {
    await campaigns.createIndex({ stripe_product_id: 1 }, { unique: true, name: "product_id_unique" });
    await campaigns.createIndex({ active: 1, display_order: 1 }, { name: "active_order" });
  }

  const meta = collections.get("donationMeta");
  if (meta) {
    await meta.createIndex({ key: 1 }, { unique: true, name: "key_unique" });
  }

  console.log("[Donation] indexes ensured on donations, campaignsCache, donationMeta");
}
