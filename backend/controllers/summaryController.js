const { computeMatch } = require("../services/matchingEngine");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /summary/:poNumber
 * A reshaped, ledger-style view of the same match computation used by
 * GET /match/:poNumber — recomputed fresh on every call, never cached.
 *
 * - poAmount: sum(po item quantity * resolved SkuMaster.agreedRate), items
 *   without a resolved rate contribute 0 to this figure (their quantity is
 *   still reflected in itemLevelBreakdown / the match engine).
 * - totalInvoiced: sum(invoice item quantity * unitRate) across all invoices.
 * - totalReceived: sum(receivedQuantity) across all GRNs (a quantity total,
 *   not a monetary amount — GRNs don't carry a rate).
 * - rows: one row per GRN/Invoice document, in chronological order, each
 *   showing that document's own quantity plus the running cumulative
 *   received/invoiced quantities and pending delivery at that point in time,
 *   followed by a final "Current Status" row with the overall totals and
 *   the current three-way match status.
 */
async function getSummary(req, res) {
  const { poNumber } = req.params;
  if (!poNumber) {
    return res.status(400).json({ error: "poNumber is required" });
  }

  try {
    const match = await computeMatch(poNumber);

    if (match.status === "insufficient_documents") {
      return res.status(200).json({
        poNumber,
        status: match.status,
        reasons: match.reasons.overall,
        poAmount: null,
        totalInvoiced: null,
        totalReceived: null,
        rows: [],
      });
    }

    const { po, grns, invoices } = match.linkedDocs;

    // Build a lookup from item key -> resolved SkuMaster info via the
    // itemLevelBreakdown the matching engine already computed.
    const skuByKey = new Map(
      match.itemLevelBreakdown.map((row) => [row.itemKey, row.resolvedSku])
    );

    const totalPoQty = match.itemLevelBreakdown.reduce((sum, r) => sum + r.poQty, 0);

    let poAmount = 0;
    for (const row of match.itemLevelBreakdown) {
      if (row.resolvedSku && row.resolvedSku.agreedRate) {
        poAmount += row.poQty * toNumber(row.resolvedSku.agreedRate);
      }
    }

    let totalInvoicedAmount = 0;
    let totalInvoicedQty = 0;
    for (const inv of invoices) {
      for (const item of inv.items || []) {
        totalInvoicedQty += toNumber(item.quantity);
        totalInvoicedAmount += toNumber(item.quantity) * toNumber(item.unitRate);
      }
    }

    let totalReceivedQty = 0;
    for (const grn of grns) {
      for (const item of grn.items || []) {
        totalReceivedQty += toNumber(item.receivedQuantity);
      }
    }

    // Chronological ledger of documents (GRNs + Invoices)
    const ledgerDocs = [
      ...grns.map((g) => ({
        docType: "grn",
        docNumber: g.grnNumber,
        date: g.grnDate,
        qty: (g.items || []).reduce((s, i) => s + toNumber(i.receivedQuantity), 0),
      })),
      ...invoices.map((inv) => ({
        docType: "invoice",
        docNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        qty: (inv.items || []).reduce((s, i) => s + toNumber(i.quantity), 0),
      })),
    ].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });

    let cumulativeReceived = 0;
    let cumulativeInvoiced = 0;

    const rows = ledgerDocs.map((entry) => {
      if (entry.docType === "grn") cumulativeReceived += entry.qty;
      if (entry.docType === "invoice") cumulativeInvoiced += entry.qty;

      return {
        documentType: entry.docType,
        documentNumber: entry.docNumber,
        date: entry.date,
        quantity: entry.qty,
        cumulativeReceivedQty: cumulativeReceived,
        cumulativeInvoicedQty: cumulativeInvoiced,
        pendingDelivery: Math.max(totalPoQty - cumulativeReceived, 0),
      };
    });

    rows.push({
      documentType: "current_status",
      documentNumber: null,
      date: new Date(),
      quantity: null,
      cumulativeReceivedQty: cumulativeReceived,
      cumulativeInvoicedQty: cumulativeInvoiced,
      pendingDelivery: Math.max(totalPoQty - cumulativeReceived, 0),
      label: "Current Status",
      status: match.status,
      reasons: match.reasons.overall,
    });

    return res.status(200).json({
      poNumber,
      status: match.status,
      poAmount,
      totalInvoiced: totalInvoicedAmount,
      totalInvoicedQty,
      totalReceived: totalReceivedQty,
      totalPoQty,
      rows,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to compute summary" });
  }
}

module.exports = { getSummary };
