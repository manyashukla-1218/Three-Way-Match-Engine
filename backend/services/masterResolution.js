const SkuMaster = require("../models/SkuMaster");

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Extracts the leading token of a code string, split on whitespace — e.g.
 * "11423 psm" -> "11423". Used only as a fallback lookup key when the full
 * itemCode fails to match anything (Gemini sometimes captures trailing
 * text like a brand name that was printed next to the code in the PDF
 * table). Returns "" if there's no leading token.
 */
function leadingToken(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

/**
 * Attempts to resolve a single item to a SkuMaster record:
 *   1. match item.itemCode against SkuMaster.skuErpCode (case-insensitive, trimmed)
 *   2. if not found, match item.itemCode against SkuMaster.eanCode the same way
 *   3. if still not found, retry steps 1-2 using only the leading token of
 *      itemCode (handles Gemini extracting "11423 psm" instead of "11423")
 * Returns the matched SkuMaster document, or null if unresolved.
 * Never throws for an unresolved item — that's a normal, expected outcome.
 */
async function resolveItemToMaster(itemCode) {
  const code = normalise(itemCode);
  if (!code) return null;

  const allMasters = await SkuMaster.find({}).lean();

  let match = allMasters.find((m) => normalise(m.skuErpCode) === code);
  if (match) return match;

  match = allMasters.find((m) => normalise(m.eanCode) === code);
  if (match) return match;

  // Fallback: try just the leading token of the itemCode.
  const fallbackCode = normalise(leadingToken(itemCode));
  if (fallbackCode && fallbackCode !== code) {
    match = allMasters.find((m) => normalise(m.skuErpCode) === fallbackCode);
    if (match) return match;

    match = allMasters.find((m) => normalise(m.eanCode) === fallbackCode);
    if (match) return match;
  }

  return null;
}

/**
 * Runs master resolution over every item of a parsed document (mutates each
 * item in place, setting `skuMaster` to the resolved ObjectId or null).
 * Returns an array of warnings, e.g.
 *   [{ itemCode, warning: "unmapped_master_sku" }, ...]
 */
async function resolveMastersForItems(items) {
  const warnings = [];

  // Fetch once and reuse for the whole batch instead of querying per item.
  const allMasters = await SkuMaster.find({}).lean();
  const byErpCode = new Map();
  const byEan = new Map();
  for (const m of allMasters) {
    if (m.skuErpCode) byErpCode.set(normalise(m.skuErpCode), m);
    if (m.eanCode) byEan.set(normalise(m.eanCode), m);
  }

  for (const item of items) {
    const code = normalise(item.itemCode);
    let match = code ? byErpCode.get(code) : null;
    if (!match && code) match = byEan.get(code);

    // Fallback: full itemCode didn't match anything — try just its leading
    // token (before the first whitespace). Handles cases like "11423 psm"
    // where Gemini pulled in trailing brand text next to the code.
    if (!match) {
      const fallbackCode = normalise(leadingToken(item.itemCode));
      if (fallbackCode && fallbackCode !== code) {
        match = byErpCode.get(fallbackCode) || byEan.get(fallbackCode);
      }
    }

    if (match) {
      item.skuMaster = match._id;
    } else {
      item.skuMaster = null;
      warnings.push({ itemCode: item.itemCode || null, warning: "unmapped_master_sku" });
    }
  }

  return warnings;
}

module.exports = { resolveItemToMaster, resolveMastersForItems, normalise, leadingToken };