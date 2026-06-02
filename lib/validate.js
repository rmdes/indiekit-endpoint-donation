/**
 * Native input validation helpers. Used by admin controllers to coerce
 * request.body / request.params fields to safe types BEFORE they hit
 * MongoDB or get rendered back to clients.
 *
 * Why no Zod or similar: the plugin keeps its dependency footprint
 * minimal. These helpers cover the narrow set of inputs the donation
 * plugin actually accepts and reject everything else as bad input.
 */

/** Coerce to a non-empty string of bounded length. Returns null if invalid. */
export function str(value, { max = 200, allowEmpty = false } = {}) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) return null;
  return trimmed.slice(0, max);
}

/** Coerce to a positive integer (cents). Returns null on invalid input. */
export function cents(value, { min = 1, max = 1_000_000_00 } = {}) {
  // Accept "12,50" (FR) and "12.50" (en). Floor-fail on garbage.
  const cleaned = typeof value === "string"
    ? value.replace(",", ".").trim()
    : value;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  const c = Math.round(n * 100);
  if (c < min || c > max) return null;
  return c;
}

/** Coerce to ISO 8601 date string (YYYY-MM-DD or full). Returns null if invalid. */
export function isoDate(value) {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Coerce to a non-negative integer (for display_order etc). */
export function nonNegInt(value, { max = 1000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > max) return null;
  return Math.floor(n);
}

/** Coerce HTML form checkbox value to boolean. */
export function checkbox(value) {
  return value === "on" || value === "true" || value === true;
}

/**
 * Coerce a Stripe / Mongo identifier to a string. Strips any object/array
 * shape that could be mistaken for a Mongo query operator (e.g. {$ne: null}).
 * Throws on truly hostile input so the caller can return 400.
 */
export function safeId(value, { maxLen = 80 } = {}) {
  if (typeof value !== "string") {
    throw new Error("id must be a string");
  }
  // Allow alphanumerics, underscore, hyphen — Stripe IDs and our own.
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > maxLen) {
    throw new Error("id contains invalid characters or is too long");
  }
  return value;
}

/** Allow-listed currency code. */
export function currency(value, { allowed = ["EUR", "USD", "GBP", "CHF"] } = {}) {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  return allowed.includes(upper) ? upper : null;
}
