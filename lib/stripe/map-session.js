/**
 * Map a Stripe webhook event (Checkout Session, Invoice, etc.) →
 * donation schema.
 * @module stripe/map-session
 *
 * Custom field labels expected on the Payment Link (decided 2026-05-21):
 *   - "Afficher mon don ?"  dropdown: named | anon | hide
 *   - "Nom à afficher (optionnel)"  text
 *   - "Message court (optionnel)"   text
 */

const CONSENT_KEY = "consent";       // dropdown
const DISPLAY_KEY = "display_name";  // text
const MESSAGE_KEY = "message";       // text

function customField(session, key) {
  const fields = session?.custom_fields ?? [];
  return fields.find((f) => f.key === key);
}

function readConsent(session) {
  const f = customField(session, CONSENT_KEY);
  const value = f?.dropdown?.value ?? "anon"; // safe default
  // Map the three options to the internal flags.
  // - "named":  consent_public=true,  display set (from display field)
  // - "anon":   consent_public=true,  display=null (shown as "Anonyme")
  // - "hide":   consent_public=false, display=null (hidden from public list)
  switch (value) {
    case "named":
      return { consent_public: true, named: true };
    case "anon":
      return { consent_public: true, named: false };
    case "hide":
    default:
      return { consent_public: false, named: false };
  }
}

export async function mapSessionToDonation(event, _cfg) {
  const session = event.data?.object;
  if (!session) return null;

  // Resolve product_id from line items (Stripe webhook embeds them).
  const lineItem = session.line_items?.data?.[0] ?? session.lines?.data?.[0];
  const campaign_id =
    lineItem?.price?.product ??
    session.metadata?.campaign_id ??
    null;

  if (!campaign_id) {
    console.warn(`[Donation] webhook event ${event.id} had no resolvable campaign_id`);
    return null;
  }

  const { consent_public, named } = readConsent(session);
  const displayField = customField(session, DISPLAY_KEY)?.text?.value?.trim() || null;
  const messageField = customField(session, MESSAGE_KEY)?.text?.value?.trim() || null;

  const display = named ? (displayField || "Donateur") : null;
  const message = consent_public ? messageField : null;

  return {
    stripe_id: session.id ?? session.payment_intent ?? event.id,
    date: new Date((session.created ?? event.created) * 1000),
    amount_cents: session.amount_total ?? session.amount_paid ?? 0,
    currency: (session.currency ?? "eur").toUpperCase(),
    campaign_id,
    recurring: event.type === "invoice.paid",
    donor: {
      donor_id: session.customer ?? `session_${session.id}`,
      display,
      consent_public,
      message,
    },
    source: "stripe",
    refunded: false,
    meta: {
      event_type: event.type,
      payment_status: session.payment_status,
      payment_intent: session.payment_intent,
      mode: session.mode,
    },
    created_at: new Date(),
    updated_at: new Date(),
  };
}
