const mongoose = require("mongoose");
const { Schema } = mongoose;

const InvoiceItemSchema = new Schema(
  {
    itemCode: { type: String, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number },
    unitRate: { type: Number },
    mrp: { type: Number },
    skuMaster: { type: Schema.Types.ObjectId, ref: "SkuMaster", default: null },
  },
  { _id: false }
);

const InvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, trim: true },
    // Plain field, NOT a ref — the corresponding PO may not exist yet.
    poNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date },
    items: { type: [InvoiceItemSchema], default: [] },
    rawParsed: { type: Schema.Types.Mixed },
    sourceFile: {
      path: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
  },
  { timestamps: true }
);

// Non-unique on purpose — see Grn.js for why. Duplicate {poNumber,
// invoiceNumber} pairs are detected in dedupeCheck.js and flagged, not
// rejected at the DB layer.
InvoiceSchema.index({ poNumber: 1, invoiceNumber: 1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);
