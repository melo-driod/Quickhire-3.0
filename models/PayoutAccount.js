const mongoose = require("mongoose");

const payoutAccountSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  bankName: { type: String, required: true },
  bankCode: { type: String, required: true },
  accountName: { type: String, required: true },
  accountLast4: { type: String, required: true },
  recipientCode: { type: String, required: true },
  verifiedAt: { type: Date, required: true },
  cooldownUntil: { type: Date, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("PayoutAccount", payoutAccountSchema);
