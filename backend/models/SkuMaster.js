const mongoose = require("mongoose");
const { Schema } = mongoose;

const SkuMasterSchema = new Schema(
  {
    skuErpCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true },
    eanCode: { type: String, trim: true },
    hsnCode: { type: String, trim: true },
    uom: { type: String, trim: true },
    agreedRate: { type: Number },
    mrp: { type: Number },
    priceTolerance: { type: Number, default: 0.05 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SkuMaster", SkuMasterSchema);
