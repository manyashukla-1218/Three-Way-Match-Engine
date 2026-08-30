const fs = require("fs");
const mongoose = require("mongoose");

const PurchaseOrder = require("../models/PurchaseOrder");
const Grn = require("../models/Grn");
const Invoice = require("../models/Invoice");
const MatchAudit = require("../models/MatchAudit");

const { parseDocument } = require("../services/parseDocument");
const { resolveMastersForItems } = require("../services/masterResolution");
const { checkForDuplicates } = require("../services/dedupeCheck");

const MODEL_BY_TYPE = { po: PurchaseOrder, grn: Grn, invoice: Invoice };
const VALID_TYPES = new Set(["po", "grn", "invoice"]);

async function appendAudit(poNumber, step, status, message) {
  if (!poNumber) return;
  await MatchAudit.findOneAndUpdate(
    { poNumber },
    { $push: { steps: { step, status, message, at: new Date() } } },
    { upsert: true, new: true }
  );
}

function safeUnlink(filePath) {
  fs.unlink(filePath, () => {
    /* best-effort cleanup, ignore errors */
  });
}

/**
 * Maps the Gemini-extracted JSON shape onto the fields the Mongoose model
 * expects. Keeps upload() readable by not inlining this per document type.
 */
function buildDocPayload(documentType, parsed, file) {
  const sourceFile = {
    path: file.path,
    originalName: file.originalname,
    mimeType: file.mimetype,
  };

  if (documentType === "po") {
    return {
      poNumber: parsed.poNumber,
      poDate: parsed.poDate ? new Date(parsed.poDate) : null,
      vendorName: parsed.vendorName,
      items: (parsed.items || []).map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        quantity: i.quantity,
        skuMaster: null,
      })),
      rawParsed: parsed,
      sourceFile,
    };
  }

  if (documentType === "grn") {
    return {
      grnNumber: parsed.grnNumber,
      poNumber: parsed.poNumber,
      grnDate: parsed.grnDate ? new Date(parsed.grnDate) : null,
      items: (parsed.items || []).map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        receivedQuantity: i.receivedQuantity,
        mrp: i.mrp ?? null,
        skuMaster: null,
      })),
      rawParsed: parsed,
      sourceFile,
    };
  }

  // invoice
  return {
    invoiceNumber: parsed.invoiceNumber,
    poNumber: parsed.poNumber,
    invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
    items: (parsed.items || []).map((i) => ({
      itemCode: i.itemCode,
      description: i.description,
      quantity: i.quantity,
      unitRate: i.unitRate ?? null,
      mrp: i.mrp ?? null,
      skuMaster: null,
    })),
    rawParsed: parsed,
    sourceFile,
  };
}

/**
 * POST /documents/upload
 * multipart/form-data: file, documentType ("po" | "grn" | "invoice")
 */
async function upload(req, res) {
  const { documentType } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded (expected multipart field \"file\")" });
  }

  if (!VALID_TYPES.has(documentType)) {
    safeUnlink(file.path);
    return res.status(400).json({
      error: `Invalid or missing "documentType". Must be one of: po, grn, invoice`,
    });
  }

  // 2 & 3: parse via Gemini, validate, retry once internally
  const parseResult = await parseDocument(documentType, file.path);

  if (!parseResult.success) {
    safeUnlink(file.path);
    await appendAudit(
      req.body.poNumberHint || null,
      "upload_parse",
      "error",
      parseResult.error
    );
    return res.status(422).json({ error: parseResult.error });
  }

  const parsed = parseResult.data;
  const poNumber = parsed.poNumber;

  if (!poNumber) {
    // GRN/Invoice extraction succeeded shape-wise but poNumber came back null
    // — we can't link this document to anything, so reject cleanly.
    safeUnlink(file.path);
    return res.status(422).json({
      error: "Extracted document has no poNumber; cannot link it to a purchase order",
    });
  }

  try {
    // 4. Master resolution on every item (mutates parsed.items in place,
    // setting item.skuMaster to the resolved ObjectId or null)
    const items = parsed.items;
    const masterWarnings = await resolveMastersForItems(items);

    // 5. Duplication check (never blocks saving)
    const dupWarnings = await checkForDuplicates(documentType, parsed);

    // 6. Persist regardless of whether the PO currently exists
    const payload = buildDocPayload(documentType, parsed, file);
    // Re-apply resolved skuMaster ids (resolveMastersForItems mutated `items`
    // which is the same array reference used inside payload.items above only
    // for po; grn/invoice items were rebuilt, so copy resolution across).
    payload.items = payload.items.map((mappedItem, idx) => ({
      ...mappedItem,
      skuMaster: items[idx].skuMaster || null,
    }));

    const Model = MODEL_BY_TYPE[documentType];
    const saved = await Model.create(payload);

    // 7. Audit log entry
    const allWarnings = [
      ...dupWarnings,
      ...masterWarnings.map((w) => w.warning),
    ];
    await appendAudit(
      poNumber,
      "upload",
      allWarnings.length > 0 ? "warning" : "success",
      `Uploaded ${documentType.toUpperCase()} document${
        allWarnings.length ? ` with warnings: ${[...new Set(allWarnings)].join(", ")}` : ""
      }`
    );

    // 8. Return saved doc + warnings
    return res.status(201).json({
      document: saved,
      warnings: {
        duplicate: dupWarnings,
        items: masterWarnings,
      },
    });
  } catch (err) {
    safeUnlink(file.path);
    await appendAudit(poNumber, "upload", "error", err.message);
    return res.status(500).json({ error: "Failed to save document" });
  }
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Looks across all three collections for a document with the given _id.
 * Returns { type, document } or null.
 */
async function findAnyDocumentById(id) {
  if (!isValidObjectId(id)) return null;

  const [po, grn, invoice] = await Promise.all([
    PurchaseOrder.findById(id),
    Grn.findById(id),
    Invoice.findById(id),
  ]);

  if (po) return { type: "po", document: po };
  if (grn) return { type: "grn", document: grn };
  if (invoice) return { type: "invoice", document: invoice };
  return null;
}

/** GET /documents/:id */
async function getById(req, res) {
  const found = await findAnyDocumentById(req.params.id);
  if (!found) return res.status(404).json({ error: "Document not found" });
  return res.status(200).json({ documentType: found.type, document: found.document });
}

/** GET /documents/:id/file — streams the original uploaded file */
async function getFile(req, res) {
  const found = await findAnyDocumentById(req.params.id);
  if (!found) return res.status(404).json({ error: "Document not found" });

  const filePath = found.document.sourceFile && found.document.sourceFile.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Source file not found on disk" });
  }

  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Failed to stream file" });
    }
  });
}

/** GET /documents?type=&poNumber= */
async function list(req, res) {
  const { type, poNumber } = req.query;

  if (type && !VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type filter. Must be one of: po, grn, invoice` });
  }

  const filter = {};
  if (poNumber) filter.poNumber = poNumber;

  try {
    if (type) {
      const Model = MODEL_BY_TYPE[type];
      const docs = await Model.find(filter).sort({ createdAt: -1 });
      return res.status(200).json({ [type]: docs });
    }

    const [pos, grns, invoices] = await Promise.all([
      PurchaseOrder.find(filter).sort({ createdAt: -1 }),
      Grn.find(filter).sort({ createdAt: -1 }),
      Invoice.find(filter).sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({ po: pos, grn: grns, invoice: invoices });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list documents" });
  }
}

module.exports = { upload, getById, getFile, list };
