const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: "" }
  },
  { timestamps: true }
);

reviewSchema.index({ service: 1, createdAt: -1 });
reviewSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
