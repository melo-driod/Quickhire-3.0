const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: { type: Number, required: true, min: 100 },
  currency: { type: String, default: "NGN" },
  bankName: { type: String, required: true },
  accountName: { type: String, required: true },
  accountLast4: { type: String, required: true },
  recipientCode: { type: String, required: true },
  reference: { type: String, required: true, unique: true },
  transferCode: { type: String, default: "" },
  status: { type: String, enum: ["pending", "success", "failed", "reversed", "review"], default: "pending" },
  reason: { type: String, default: "QuickHire provider payout" },
  riskFlags: { type: [String], default: [] }
}, { timestamps: true });

withdrawalSchema.index({ provider: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
