const PurchaseOrder = require("../models/PurchaseOrder");
const Grn = require("../models/Grn");
const Invoice = require("../models/Invoice");
const SkuMaster = require("../models/SkuMaster");

function normaliseCode(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Builds a stable key for aggregating an item across PO/GRN/Invoice:
 * prefer the resolved SkuMaster._id, fall back to the normalised itemCode
 * string when the item could not be resolved to a master record.
 */
function itemKey(item) {
  if (item.skuMaster) return `sku:${String(item.skuMaster)}`;
  return `code:${normaliseCode(item.itemCode)}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure(ish) matching function — reads fresh from MongoDB every time it is
 * called and never caches or persists a result. Given a poNumber, loads the
 * PurchaseOrder (if any), ALL Grns, and ALL Invoices for that poNumber, then
 * evaluates the three-way match.
 */
async function computeMatch(poNumber) {
  const [po, grns, invoices] = await Promise.all([
    PurchaseOrder.findOne({ poNumber }).lean(),
    Grn.find({ poNumber }).lean(),
    Invoice.find({ poNumber }).lean(),
  ]);

  const duplicatePoCount = po
    ? await PurchaseOrder.countDocuments({ poNumber })
    : 0;

  if (!po || grns.length === 0 || invoices.length === 0) {
    return {
      poNumber,
      status: "insufficient_documents",
      reasons: {
        overall: [
          !po ? "po_missing" : null,
          grns.length === 0 ? "grn_missing" : null,
          invoices.length === 0 ? "invoice_missing" : null,
        ].filter(Boolean),
        perItem: {},
      },
      linkedDocs: {
        po: po || null,
        grns,
        invoices,
      },
      itemLevelBreakdown: [],
    };
  }

  // Preload all SkuMaster docs referenced anywhere so we can attach info
  // without N+1 queries.
  const skuIds = new Set();
  for (const doc of [po, ...grns, ...invoices]) {
    for (const item of doc.items || []) {
      if (item.skuMaster) skuIds.add(String(item.skuMaster));
    }
  }
  const skuMasters = skuIds.size
    ? await SkuMaster.find({ _id: { $in: Array.from(skuIds) } }).lean()
    : [];
  const skuById = new Map(skuMasters.map((s) => [String(s._id), s]));

  // --- Aggregate by item key across PO / GRN / Invoice ---------------------
  const aggregation = new Map(); // key -> { poQty, grnQty, invoiceQty, invoiceRates: [], invoiceMrps: [], grnMrps: [], itemCode, description, skuMasterId, inPo }

  function getOrCreate(key, seed) {
    if (!aggregation.has(key)) {
      aggregation.set(key, {
        key,
        poQty: 0,
        grnQty: 0,
        invoiceQty: 0,
        invoiceRates: [],
        invoiceMrps: [],
        grnMrps: [],
        itemCode: seed.itemCode || null,
        description: seed.description || null,
        skuMasterId: seed.skuMaster ? String(seed.skuMaster) : null,
        inPo: false,
      });
    }
    return aggregation.get(key);
  }

  for (const item of po.items || []) {
    const key = itemKey(item);
    const agg = getOrCreate(key, item);
    agg.poQty += toNumber(item.quantity);
    agg.inPo = true;
  }

  for (const grn of grns) {
    for (const item of grn.items || []) {
      const key = itemKey(item);
      const agg = getOrCreate(key, item);
      agg.grnQty += toNumber(item.receivedQuantity);
      if (item.mrp !== undefined && item.mrp !== null) agg.grnMrps.push(toNumber(item.mrp));
    }
  }

  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      const key = itemKey(item);
      const agg = getOrCreate(key, item);
      agg.invoiceQty += toNumber(item.quantity);
      if (item.unitRate !== undefined && item.unitRate !== null) {
        agg.invoiceRates.push(toNumber(item.unitRate));
      }
      if (item.mrp !== undefined && item.mrp !== null) agg.invoiceMrps.push(toNumber(item.mrp));
    }
  }

  // --- Document-level (non-item-specific) reason codes ---------------------
  const overallReasons = [];

  if (duplicatePoCount > 1) overallReasons.push("duplicate_po");

  const grnNumberCounts = new Map();
  for (const g of grns) {
    grnNumberCounts.set(g.grnNumber, (grnNumberCounts.get(g.grnNumber) || 0) + 1);
  }
  const invoiceNumberCounts = new Map();
  for (const i of invoices) {
    invoiceNumberCounts.set(i.invoiceNumber, (invoiceNumberCounts.get(i.invoiceNumber) || 0) + 1);
  }
  const hasDuplicateDocument =
    Array.from(grnNumberCounts.values()).some((c) => c > 1) ||
    Array.from(invoiceNumberCounts.values()).some((c) => c > 1);
  if (hasDuplicateDocument) overallReasons.push("duplicate_document");

  const poDate = po.poDate ? new Date(po.poDate) : null;
  const invoiceDateAfterPo =
    poDate &&
    invoices.some((inv) => inv.invoiceDate && new Date(inv.invoiceDate) > poDate);
  if (invoiceDateAfterPo) overallReasons.push("invoice_date_after_po_date");

  // --- Per-item evaluation ---------------------------------------------------
  const perItemReasons = {};
  const itemLevelBreakdown = [];

  let anyMismatch = false;
  let anyPartial = false;

  for (const [key, agg] of aggregation.entries()) {
    const reasons = [];
    const sku = agg.skuMasterId ? skuById.get(agg.skuMasterId) : null;

    if (!agg.inPo) {
      reasons.push("item_missing_in_po");
    }

    if (agg.inPo && agg.grnQty > agg.poQty) {
      reasons.push("grn_qty_exceeds_po_qty");
    }

    if (agg.invoiceQty > agg.grnQty) {
      reasons.push("invoice_qty_exceeds_grn_qty");
    }

    if (agg.inPo && agg.invoiceQty > agg.poQty) {
      reasons.push("invoice_qty_exceeds_po_qty");
    }

    if (!agg.skuMasterId) {
      reasons.push("unmapped_master_sku");
    }

    // price_mismatch: skip entirely if agreedRate missing/zero/negative
    if (sku && sku.agreedRate && sku.agreedRate > 0 && agg.invoiceRates.length > 0) {
      const tolerance = sku.priceTolerance ?? 0.05;
      const badRate = agg.invoiceRates.find((rate) => {
        const diff = Math.abs(rate - sku.agreedRate) / sku.agreedRate;
        return diff > tolerance;
      });
      if (badRate !== undefined) reasons.push("price_mismatch");
    }

    // mrp_mismatch: skip entirely if SkuMaster.mrp missing/zero/negative
    if (sku && sku.mrp && sku.mrp > 0) {
      const MRP_TOLERANCE = 0.01;
      const allMrps = [...agg.invoiceMrps, ...agg.grnMrps];
      const badMrp = allMrps.find((mrp) => {
        const diff = Math.abs(mrp - sku.mrp) / sku.mrp;
        return diff > MRP_TOLERANCE;
      });
      if (badMrp !== undefined) reasons.push("mrp_mismatch");
    }

    const fullyReconciled =
      agg.inPo &&
      agg.poQty === agg.grnQty &&
      agg.grnQty === agg.invoiceQty &&
      reasons.length === 0;

    if (!fullyReconciled && reasons.length === 0) {
      // Quantities not fully reconciled but no explicit reason code applies
      // (e.g. partial delivery still in progress) -> still partially matched.
      reasons.push("quantities_not_fully_reconciled");
    }

    const hardViolations = [
      "grn_qty_exceeds_po_qty",
      "invoice_qty_exceeds_grn_qty",
      "invoice_qty_exceeds_po_qty",
      "item_missing_in_po",
    ];
    if (reasons.some((r) => hardViolations.includes(r))) {
      anyMismatch = true;
    } else if (reasons.length > 0) {
      anyPartial = true;
    }

    perItemReasons[key] = reasons;

    itemLevelBreakdown.push({
      itemKey: key,
      itemCode: agg.itemCode,
      description: agg.description,
      resolvedSku: sku
        ? {
            id: String(sku._id),
            skuErpCode: sku.skuErpCode,
            name: sku.name,
            hsnCode: sku.hsnCode,
            uom: sku.uom,
            agreedRate: sku.agreedRate,
            mrp: sku.mrp,
          }
        : null,
      poQty: agg.poQty,
      grnQty: agg.grnQty,
      invoiceQty: agg.invoiceQty,
      pendingQty: Math.max(agg.poQty - agg.grnQty, 0),
      reasons,
    });
  }

  if (overallReasons.includes("invoice_date_after_po_date")) anyMismatch = true;
  if (overallReasons.includes("duplicate_po")) anyMismatch = true;
  if (overallReasons.includes("duplicate_document")) anyMismatch = true;

  let status;
  if (anyMismatch) status = "mismatch";
  else if (anyPartial) status = "partially_matched";
  else status = "matched";

  return {
    poNumber,
    status,
    reasons: {
      overall: overallReasons,
      perItem: perItemReasons,
    },
    linkedDocs: { po, grns, invoices },
    itemLevelBreakdown,
  };
}

module.exports = { computeMatch, itemKey, normaliseCode };
