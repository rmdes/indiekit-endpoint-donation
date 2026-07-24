import { test } from "node:test";
import assert from "node:assert/strict";
import { DONATION_BLOCKS } from "../lib/blocks.js";

// C4 — donation v2 `get blocks()`. Assertions replicate the invariants of
// site-config's `validBlockEntry` (lib/discovery/block-entry.js) and its
// frozen schema subset (lib/validators/block-schema.js); the canonical
// validator lives in site-config (not a dependency here), so we encode it.

const KEBAB_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REGIONS = new Set(["main", "sidebar", "footer", "hero"]);
const SURFACES = new Set(["homepage", "collection", "postType", "standalone"]);
const DATA_SOURCES = new Set(["file", "collections", "config", "api"]);
const PROPERTY_KEYWORDS = new Set([
  "type", "enum", "default", "minimum", "maximum", "maxLength",
  "title", "description", "items", "x-control", "x-advanced",
  "x-allowed-url-hosts",
]);

test("DONATION_BLOCKS: exactly the donation-campaign block", () => {
  assert.deepEqual(DONATION_BLOCKS.map((b) => b.id), ["donation-campaign"]);
});

test("DONATION_BLOCKS: every entry satisfies the v2 block contract", () => {
  for (const b of DONATION_BLOCKS) {
    assert.ok(KEBAB_ID.test(b.id), `${b.id}: id kebab`);
    assert.ok(Number.isInteger(b.version) && b.version >= 1, `${b.id}: version >= 1`);
    assert.ok(typeof b.label === "string" && b.label.length > 0, `${b.id}: label`);
    assert.ok(Array.isArray(b.placement.regions) && b.placement.regions.length > 0, `${b.id}: regions`);
    assert.ok(b.placement.regions.every((r) => REGIONS.has(r)), `${b.id}: regions vocab`);
    assert.ok(Array.isArray(b.placement.surfaces), `${b.id}: surfaces array`);
    assert.ok(b.placement.surfaces.every((s) => SURFACES.has(s)), `${b.id}: surfaces vocab`);
    assert.ok(DATA_SOURCES.has(b.data.source), `${b.id}: data.source`);
    assert.equal(typeof b.multiple, "boolean", `${b.id}: multiple boolean`);
    assert.equal(b.schema.type, "object", `${b.id}: schema.type`);
    assert.equal(b.schema.additionalProperties, false, `${b.id}: additionalProperties false`);
    assert.ok(b.schema.properties && typeof b.schema.properties === "object", `${b.id}: properties`);
    assert.ok(!("required" in b.schema), `${b.id}: NO required`);
    for (const [name, def] of Object.entries(b.schema.properties)) {
      for (const key of Object.keys(def)) {
        assert.ok(PROPERTY_KEYWORDS.has(key), `${b.id}.${name}: keyword "${key}" in frozen subset`);
      }
    }
  }
});

test("donation-campaign: api-sourced bespoke block with optional campaign picker", () => {
  const [b] = DONATION_BLOCKS;
  assert.deepEqual([...b.placement.regions], ["main"], "no widgets/ variant → no sidebar");
  assert.deepEqual([...b.placement.surfaces], ["homepage", "standalone"]);
  assert.deepEqual(b.data, { source: "api" });
  assert.equal(b.multiple, true, "config differentiates instances");
  assert.ok(!b.render, "bespoke — theme owns sections/donation-campaign.njk + js/widgets/donation-campaign.js");
  const { campaignId, title } = b.schema.properties;
  assert.equal(campaignId.type, "string");
  assert.equal(campaignId.maxLength, 100);
  assert.equal(title.type, "string");
  assert.equal(title.maxLength, 120);
  assert.equal(b.defaultConfig, undefined, "both fields optional, no defaults needed");
});
