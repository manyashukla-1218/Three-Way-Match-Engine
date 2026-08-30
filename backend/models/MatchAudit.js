const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditStepSchema = new Schema(
  {
    step: { type: String, required: true },
    status: { type: String, required: true }, // e.g. "success" | "warning" | "error"
    message: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MatchAuditSchema = new Schema(
  {
    poNumber: { type: String, required: true, trim: true },
    steps: { type: [AuditStepSchema], default: [] },
  },
  { timestamps: true }
);

MatchAuditSchema.index({ poNumber: 1 });

module.exports = mongoose.model("MatchAudit", MatchAuditSchema);
