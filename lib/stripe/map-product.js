/**
 * Map a Stripe Product (+ its primary Payment Link) → campaigns schema.
 * @module stripe/map-product
 */

/**
 * @param {object} product - Stripe Product object (with metadata)
 * @param {string|null} paymentLinkUrl - Resolved Payment Link URL
 * @returns {object} campaign document
 */
export function mapProductToCampaign(product, paymentLinkUrl = null) {
  const m = product.metadata ?? {};
  return {
    stripe_product_id: product.id,
    title: product.name,
    subtitle: m.subtitle ?? "",
    description: product.description ?? "",
    goal_cents: Number(m.goal_cents ?? 0) || 0,
    active: Boolean(product.active),
    started: m.campaign_starts ? new Date(m.campaign_starts) : null,
    ends: m.campaign_ends ? new Date(m.campaign_ends) : null,
    display_order: Number(m.display_order ?? 100),
    stripe_payment_link: paymentLinkUrl,
  };
}
