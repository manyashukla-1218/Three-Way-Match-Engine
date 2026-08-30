const mongoose = require("mongoose");
const { Schema } = mongoose;

const PoItemSchema = new Schema(
  {
    itemCode: { type: String, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number },
    skuMaster: { type: Schema.Types.ObjectId, ref: "SkuMaster", default: null },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, required: true, trim: true },
    poDate: { type: Date },
    vendorName: { type: String, trim: true },
    items: { type: [PoItemSchema], default: [] },
    rawParsed: { type: Schema.Types.Mixed },
    sourceFile: {
      path: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
  },
  { timestamps: true }
);

// NOTE: poNumber is intentionally NOT globally unique — duplicate POs are
// allowed to be saved (and flagged) per the duplication-check requirement.
PurchaseOrderSchema.index({ poNumber: 1 });

module.exports = mongoose.model("PurchaseOrder", PurchaseOrderSchema);
