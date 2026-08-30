const mongoose = require("mongoose");
const { Schema } = mongoose;

const GrnItemSchema = new Schema(
  {
    itemCode: { type: String, trim: true },
    description: { type: String, trim: true },
    receivedQuantity: { type: Number },
    mrp: { type: Number },
    skuMaster: { type: Schema.Types.ObjectId, ref: "SkuMaster", default: null },
  },
  { _id: false }
);

const GrnSchema = new Schema(
  {
    grnNumber: { type: String, required: true, trim: true },
    // Plain field, NOT a ref — the corresponding PO may not exist yet
    // (out-of-order uploads must always succeed).
    poNumber: { type: String, required: true, trim: true },
    grnDate: { type: Date },
    items: { type: [GrnItemSchema], default: [] },
    rawParsed: { type: Schema.Types.Mixed },
    sourceFile: {
      path: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
  },
  { timestamps: true }
);

// NOTE: kept as a non-unique compound index (not `unique: true`). The
// duplication-check requirement explicitly says a GRN with the same
// {poNumber, grnNumber} must still be SAVED (flagged as "duplicate_document",
// never rejected) — a unique index would throw on that second insert instead.
// Duplicate detection is therefore done in application code (dedupeCheck.js)
// before persistence.
GrnSchema.index({ poNumber: 1, grnNumber: 1 });

module.exports = mongoose.model("Grn", GrnSchema);
