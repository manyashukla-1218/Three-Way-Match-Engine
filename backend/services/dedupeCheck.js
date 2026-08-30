const PurchaseOrder = require("../models/PurchaseOrder");
const Grn = require("../models/Grn");
const Invoice = require("../models/Invoice");

/**
 * Duplication check — NEVER blocks saving, only flags. Runs before
 * persistence so the controller can decide what to write into the audit log
 * and response, but the caller is still responsible for saving the document
 * regardless of the outcome here.
 *
 * Returns an array of warning strings, e.g. ["duplicate_po"] or
 * ["duplicate_document"] or [].
 */
async function checkForDuplicates(documentType, parsed) {
  const warnings = [];

  if (documentType === "po") {
    const existing = await PurchaseOrder.findOne({ poNumber: parsed.poNumber }).lean();
    if (existing) warnings.push("duplicate_po");
    return warnings;
  }

  if (documentType === "grn") {
    const existing = await Grn.findOne({
      poNumber: parsed.poNumber,
      grnNumber: parsed.grnNumber,
    }).lean();
    if (existing) warnings.push("duplicate_document");
    return warnings;
  }

  if (documentType === "invoice") {
    const existing = await Invoice.findOne({
      poNumber: parsed.poNumber,
      invoiceNumber: parsed.invoiceNumber,
    }).lean();
    if (existing) warnings.push("duplicate_document");
    return warnings;
  }

  return warnings;
}

module.exports = { checkForDuplicates };
