/**
 * Donation CRUD against MongoDB.
 * @module storage/donations
 */

function collection(application) {
  return application.collections?.get("donations");
}

/**
 * Insert a donation, upsert by stripe_id so duplicate webhooks are idempotent.
 * @param {object} application - indiekit application locals
 * @param {object} donation - shape per CLAUDE.md
 * @returns {Promise<object>} the upserted donation
 */
export async function upsertDonation(application, donation) {
  const c = collection(application);
  if (!c) throw new Error("donations collection unavailable");
  const now = new Date();
  const doc = {
    ...donation,
    updated_at: now,
    created_at: donation.created_at ?? now,
  };
  await c.updateOne(
    { stripe_id: donation.stripe_id },
    { $set: doc, $setOnInsert: { _firstSeenAt: now } },
    { upsert: true },
  );
  return c.findOne({ stripe_id: donation.stripe_id });
}

/**
 * List donations with filters.
 * @param {object} application
 * @param {object} [opts]
 * @param {string} [opts.campaign_id]
 * @param {string} [opts.source] - "stripe" | "givewp_migrated" | "manual"
 * @param {boolean} [opts.includeRefunded]
 * @param {number} [opts.limit=50]
 * @param {number} [opts.skip=0]
 */
export async function listDonations(application, opts = {}) {
  const c = collection(application);
  if (!c) return [];
  const query = {};
  if (opts.campaign_id) query.campaign_id = opts.campaign_id;
  if (opts.source) query.source = opts.source;
  if (!opts.includeRefunded) query.refunded = { $ne: true };
  return c
    .find(query)
    .sort({ date: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 50)
    .toArray();
}

/** Sum amounts for a campaign (in cents). */
export async function sumByCampaign(application, campaign_id) {
  const c = collection(application);
  if (!c) return { total: 0, count: 0 };
  const [agg] = await c
    .aggregate([
      { $match: { campaign_id, refunded: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$amount_cents" }, count: { $sum: 1 } } },
    ])
    .toArray();
  return agg ?? { total: 0, count: 0 };
}

/** Lifetime stats: total raised, unique donors. */
export async function lifetimeStats(application) {
  const c = collection(application);
  if (!c) return { total: 0, donor_count: 0, donation_count: 0 };
  const [agg] = await c
    .aggregate([
      { $match: { refunded: { $ne: true } } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount_cents" },
          donation_count: { $sum: 1 },
          donors: { $addToSet: "$donor.donor_id" },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          donation_count: 1,
          donor_count: { $size: "$donors" },
        },
      },
    ])
    .toArray();
  return agg ?? { total: 0, donor_count: 0, donation_count: 0 };
}

export async function getDonation(application, id) {
  const c = collection(application);
  if (!c) return null;
  return c.findOne({ stripe_id: id });
}

export async function updateConsent(application, id, consent_public) {
  const c = collection(application);
  if (!c) throw new Error("donations collection unavailable");
  await c.updateOne(
    { stripe_id: id },
    {
      $set: {
        "donor.consent_public": Boolean(consent_public),
        "donor.display": consent_public ? null : undefined, // don't auto-clear; admin decides
        updated_at: new Date(),
      },
    },
  );
  return getDonation(application, id);
}

export async function markRefunded(application, id, refundedAt = new Date()) {
  const c = collection(application);
  if (!c) throw new Error("donations collection unavailable");
  await c.updateOne(
    { stripe_id: id },
    { $set: { refunded: true, refunded_at: refundedAt, updated_at: new Date() } },
  );
}

export async function removeDonation(application, id) {
  const c = collection(application);
  if (!c) throw new Error("donations collection unavailable");
  await c.deleteOne({ stripe_id: id });
}
