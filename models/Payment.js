const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    hire: { type: mongoose.Schema.Types.ObjectId, ref: "Hire" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },
    status: { type: String, enum: ["initialized", "success", "failed"], default: "initialized" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
