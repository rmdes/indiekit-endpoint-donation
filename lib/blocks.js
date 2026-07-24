/**
 * Donation v2 block declaration (site-builder spec, "Donation block —
 * chardonsbleus archetype").
 *
 * `donation-campaign` renders campaign progress (goal, raised total, donor
 * count, Stripe payment link) CLIENT-SIDE against the public
 * `/donation/stats.json` (60s cache) — `source:"api"` per the spec: the old
 * design's site-specific `_data/donations.js` MongoDB read at build time is
 * impossible under one-neutral-theme. Bespoke template: the theme owns
 * `components/sections/donation-campaign.njk` +
 * `js/widgets/donation-campaign.js`.
 *
 * @module lib/blocks
 */

/** @type {Array<object>} */
export const DONATION_BLOCKS = [
  {
    id: "donation-campaign",
    version: 1,
    label: "Donation campaign",
    description: "Campaign progress with goal, raised total, and payment link",
    icon: "heart",
    category: "social",
    // main only: no compact widgets/ variant exists, and the sidebar's
    // collapsible chrome + narrow column don't suit the progress-bar layout.
    // Add "sidebar" together with a widgets/donation-campaign.njk if wanted.
    placement: {
      regions: ["main"],
      surfaces: ["homepage", "standalone"],
    },
    // Config differentiates instances (one block per campaign), so multiple
    // placements are legitimate.
    multiple: true,
    data: { source: "api" },
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        campaignId: {
          type: "string",
          title: "Campaign",
          description:
            "Stripe product id (prod_…). Leave empty to show all active campaigns.",
          maxLength: 100,
        },
        title: {
          type: "string",
          title: "Heading",
          description: "Optional heading shown above the campaign card(s).",
          maxLength: 120,
        },
      },
    },
  },
];
